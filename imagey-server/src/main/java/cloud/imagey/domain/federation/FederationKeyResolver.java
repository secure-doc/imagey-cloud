/*
 * This file is part of Imagey.
 *
 * Imagey is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Imagey is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Imagey.  If not, see <http://www.gnu.org/licenses/>.
 */
package cloud.imagey.domain.federation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.nimbusds.jose.jwk.ECKey;

import cloud.imagey.infrastructure.federation.FederationDomain;
import cloud.imagey.infrastructure.federation.FederationKeyFetcher;
import cloud.imagey.infrastructure.federation.FetchResult;
import cloud.imagey.infrastructure.federation.FetchResult.Failure;

/**
 * The public signing key of a foreign server (ADR 0013 decision 1): fetched from the server itself,
 * never from anything the caller supplies. What the resolver does towards the outside is bounded:
 * <ul>
 *   <li>a result is cached for the {@code max-age} of the answer, clamped to a floor and a ceiling;
 *       a failure is cached briefly, too, so that an unreachable server is not asked again at once;</li>
 *   <li>a key it does not know triggers one refetch per domain and cooldown (the server may have
 *       rotated), not one per request;</li>
 *   <li>only a limited number of domains per minute are fetched for the first time, so that a flood
 *       of made-up domains cannot make this server a source of requests;</li>
 *   <li>concurrent callers for one domain share one fetch.</li>
 * </ul>
 *
 * <p>Known limit: the budget for new domains is global. A caller who names {@code newDomainsPerMinute}
 * made-up domains a minute uses it up, and a real new partner is then not resolved until the minute
 * is over (known domains are not affected). Once the callers are unauthenticated assertions (F4), a
 * budget per client must be added; see ADR 0013.
 *
 * <p>The own domains are never fetched: their key is the one of this deployment.
 */
@ApplicationScoped
public class FederationKeyResolver {

    private static final Logger LOG = LogManager.getLogger(FederationKeyResolver.class);
    private static final int MAX_DOMAINS = 10_000;
    private static final Duration NEW_DOMAIN_WINDOW = Duration.ofMinutes(1);

    @Inject
    private FederationSettings settings;

    @Inject
    private FederationSigningKey ownKey;

    @Inject
    private FederationKeyFetcher fetcher;

    @Inject
    private Clock clock;

    private final Map<String, Entry> cache = Collections.synchronizedMap(new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
            return size() > MAX_DOMAINS;
        }
    });
    private final Map<String, CompletableFuture<Entry>> inFlight = new ConcurrentHashMap<>();
    private final Deque<Instant> newDomainFetches = new ArrayDeque<>();

    public FederationKeyResolver() {
    }

    public FederationKeyResolver(FederationSettings settings, FederationSigningKey ownKey, FederationKeyFetcher fetcher, Clock clock) {
        this.settings = settings;
        this.ownKey = ownKey;
        this.fetcher = fetcher;
        this.clock = clock;
    }

    /**
     * The public key of {@code domain} with this key id, or empty. Never throws for a failure of the
     * remote side - it is just no key.
     */
    public Optional<ECKey> resolve(String domain, String kid) {
        Optional<String> normalized = FederationDomain.normalize(domain);
        if (!settings.enabled() || normalized.isEmpty() || kid == null) {
            return Optional.empty();
        }
        String name = normalized.get();
        if (settings.ownDomains().contains(name)) {
            return Optional.of(ownKey.publicKey()).filter(key -> kid.equals(key.getKeyID()));
        }
        Instant now = clock.instant();
        Entry entry = cache.get(name);
        if (entry == null || !now.isBefore(entry.expires())) {
            entry = load(name, entry, false);
        } else if (entry.key(kid) == null && entry.success() && !now.isBefore(entry.fetchedAt().plus(settings.keyRefetchCooldown()))) {
            entry = load(name, entry, true);
        }
        return Optional.ofNullable(entry.key(kid));
    }

    // previous: what the cache held (maybe expired); valid: whether it is still to be trusted if the fetch fails
    private Entry load(String domain, Entry previous, boolean valid) {
        CompletableFuture<Entry> mine = new CompletableFuture<>();
        CompletableFuture<Entry> other = inFlight.putIfAbsent(domain, mine);
        if (other != null) {
            return other.join();
        }
        Entry entry = Entry.unusable(clock.instant());
        try {
            entry = fetch(domain, previous, valid);
            return entry;
        } finally {
            inFlight.remove(domain);
            mine.complete(entry);
        }
    }

    private Entry fetch(String domain, Entry previous, boolean valid) {
        Instant now = clock.instant();
        // Only a domain that has answered before is exempt from the budget: a domain that failed (or was
        // refused) would otherwise turn into a free refetch as soon as its negative entry has expired.
        // A refusal is not cached, so that it does not push valid entries out of the cache either.
        if ((previous == null || !previous.success()) && !mayFetchNewDomain(now)) {
            LOG.warn("Too many foreign domains to fetch a key for, not fetching {}", domain);
            return Entry.unusable(now);
        }
        FetchResult result = fetcher.fetch(domain);
        Instant fetched = clock.instant();
        if (result.isSuccess()) {
            return remember(domain, Entry.of(result, fetched, ttl(result.maxAge())));
        }
        if (valid) {
            // A refetch for an unknown key failed: the keys that are known stay good, the cooldown starts anew.
            LOG.info("Refetching the federation keys of {} failed: {}", domain, result.failure());
            return result.failure() == Failure.OVERLOADED ? previous : remember(domain, previous.refetchedAt(fetched));
        }
        if (result.failure() == Failure.OVERLOADED) {
            return Entry.unusable(fetched);
        }
        LOG.info("No federation key for {}: {}", domain, result.failure());
        return remember(domain, Entry.failed(fetched, settings.keyCacheNegative()));
    }

    // what the server asked for, but within the floor and the ceiling
    private Duration ttl(Duration maxAge) {
        Duration asked = maxAge == null ? settings.keyCacheCeiling() : maxAge;
        if (asked.compareTo(settings.keyCacheMin()) < 0) {
            return settings.keyCacheMin();
        }
        return asked.compareTo(settings.keyCacheCeiling()) > 0 ? settings.keyCacheCeiling() : asked;
    }

    private Entry remember(String domain, Entry entry) {
        cache.put(domain, entry);
        return entry;
    }

    private boolean mayFetchNewDomain(Instant now) {
        synchronized (newDomainFetches) {
            while (!newDomainFetches.isEmpty() && !now.isBefore(newDomainFetches.peekFirst().plus(NEW_DOMAIN_WINDOW))) {
                newDomainFetches.removeFirst();
            }
            if (newDomainFetches.size() >= settings.newDomainsPerMinute()) {
                return false;
            }
            newDomainFetches.addLast(now);
            return true;
        }
    }

    private record Entry(Map<String, ECKey> keys, boolean success, Instant fetchedAt, Instant expires) {

        static Entry of(FetchResult result, Instant fetchedAt, Duration ttl) {
            Map<String, ECKey> byId = new LinkedHashMap<>();
            result.keys().forEach(key -> byId.put(key.getKeyID(), key));
            return new Entry(byId, true, fetchedAt, fetchedAt.plus(ttl));
        }

        static Entry failed(Instant fetchedAt, Duration ttl) {
            return new Entry(Map.of(), false, fetchedAt, fetchedAt.plus(ttl));
        }

        // not cached: it is already expired when it is created
        static Entry unusable(Instant at) {
            return new Entry(Map.of(), false, at, at);
        }

        ECKey key(String kid) {
            return keys.get(kid);
        }

        Entry refetchedAt(Instant at) {
            return new Entry(keys, success, at, expires);
        }
    }
}
