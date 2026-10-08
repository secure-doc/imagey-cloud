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

import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.user.DomainName;

/**
 * Federation settings (ADR 0013). While {@code federation.enabled} is {@code false} (the default)
 * the server behaves exactly like a stand-alone one: guest tokens are not accepted and no
 * cross-origin guest CORS headers are sent. The defaults live in the annotations, not in the main
 * {@code microprofile-config.properties}, because a value there would compete with the one of the
 * test configuration.
 */
@ApplicationScoped
public class FederationSettings {

    private static final String KEY_MAX_AGE = "3600";
    private static final String CACHE_CEILING = "3600";
    private static final String CACHE_MIN = "60";
    private static final String CACHE_NEGATIVE = "30";
    private static final String REFETCH_COOLDOWN = "60";
    private static final String NEW_DOMAINS_PER_MINUTE = "30";
    private static final String SESSIONS_PER_MINUTE = "30";

    @Inject
    @ConfigProperty(name = "federation.enabled", defaultValue = "false")
    private boolean enabled;

    // How long a foreign server may cache the key of this one (Cache-Control: max-age)
    @Inject
    @ConfigProperty(name = "federation.key.max-age", defaultValue = KEY_MAX_AGE)
    private long keyMaxAge = Long.parseLong(KEY_MAX_AGE);

    @Inject
    @ConfigProperty(name = "federation.key-cache.ceiling", defaultValue = CACHE_CEILING)
    private long cacheCeiling = Long.parseLong(CACHE_CEILING);

    @Inject
    @ConfigProperty(name = "federation.key-cache.min", defaultValue = CACHE_MIN)
    private long cacheMin = Long.parseLong(CACHE_MIN);

    @Inject
    @ConfigProperty(name = "federation.key-cache.negative", defaultValue = CACHE_NEGATIVE)
    private long cacheNegative = Long.parseLong(CACHE_NEGATIVE);

    @Inject
    @ConfigProperty(name = "federation.key-cache.refetch-cooldown", defaultValue = REFETCH_COOLDOWN)
    private long refetchCooldown = Long.parseLong(REFETCH_COOLDOWN);

    @Inject
    @ConfigProperty(name = "federation.key-fetch.new-domains-per-minute", defaultValue = NEW_DOMAINS_PER_MINUTE)
    private int newDomainsPerMinute = Integer.parseInt(NEW_DOMAINS_PER_MINUTE);

    // The most POST /users/federation/sessions per minute and client address
    @Inject
    @ConfigProperty(name = "federation.sessions.per-minute", defaultValue = SESSIONS_PER_MINUTE)
    private int sessionsPerMinute = Integer.parseInt(SESSIONS_PER_MINUTE);

    // Reverse proxies (addresses or CIDR ranges) whose X-Forwarded-For is believed, besides loopback
    @Inject
    @ConfigProperty(name = "federation.trusted-proxies", defaultValue = "")
    private String trustedProxies = "";

    @Inject
    @ConfigProperty(name = "secure-doc.urls")
    private List<DomainName> urls = List.of();

    // computed on first use: the urls do not change while the server runs
    private volatile Set<String> ownDomains;

    public FederationSettings() {
    }

    public FederationSettings(boolean enabled) {
        this.enabled = enabled;
    }

    public FederationSettings(boolean enabled, List<DomainName> urls) {
        this.enabled = enabled;
        this.urls = urls;
    }

    public boolean enabled() {
        return enabled;
    }

    public Duration keyMaxAge() {
        return Duration.ofSeconds(keyMaxAge);
    }

    /** The upper bound of the time a foreign key is cached, whatever the foreign server asks for. */
    public Duration keyCacheCeiling() {
        return Duration.ofSeconds(cacheCeiling);
    }

    public Duration keyCacheMin() {
        return Duration.ofSeconds(cacheMin);
    }

    /** How long a failed fetch is remembered, so that an unreachable server is not asked again at once. */
    public Duration keyCacheNegative() {
        return Duration.ofSeconds(cacheNegative);
    }

    /** The least time between two fetches for one domain that are caused by an unknown key. */
    public Duration keyRefetchCooldown() {
        return Duration.ofSeconds(refetchCooldown);
    }

    /** The most fetches per minute for domains that were never seen before (all callers together). */
    public int newDomainsPerMinute() {
        return newDomainsPerMinute;
    }

    /** The proxies in front of this server ({@code federation.trusted-proxies}), as addresses or CIDR ranges. */
    public List<String> trustedProxies() {
        return Arrays.stream(trustedProxies.split(",")).map(String::trim).filter(entry -> !entry.isEmpty()).toList();
    }

    /** The most session requests per minute one client address may make. */
    public int sessionsPerMinute() {
        return sessionsPerMinute;
    }

    /** The {@code host[:port]} (lower case) of a URL such as an origin, as assertions name a server. */
    public static String domainOf(DomainName url) {
        URI uri = URI.create(url.value());
        return (uri.getHost() + (uri.getPort() < 0 ? "" : ":" + uri.getPort())).toLowerCase(Locale.ROOT);
    }

    /**
     * The domains ({@code host[:port]}, lower case) this deployment is reached under: the hosts of
     * {@code secure-doc.urls}. One deployment serves all of them with the same identity.
     */
    public Set<String> ownDomains() {
        Set<String> cached = ownDomains;
        if (cached != null) {
            return cached;
        }
        Set<String> domains = new HashSet<>();
        for (DomainName url : urls) {
            domains.add(domainOf(url));
        }
        ownDomains = Set.copyOf(domains);
        return ownDomains;
    }
}
