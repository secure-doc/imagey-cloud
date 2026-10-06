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

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;

import cloud.imagey.domain.user.DomainName;
import cloud.imagey.infrastructure.federation.FederationKeyFetcher;
import cloud.imagey.infrastructure.federation.FetchResult;
import cloud.imagey.infrastructure.federation.FetchResult.Failure;
import cloud.imagey.infrastructure.storage.FilesystemBlobStore;

class FederationKeyResolverTest {

    private static final String DOMAIN = "b.example";

    @TempDir
    private Path root;

    private final TestClock clock = new TestClock();
    private final FakeFetcher fetcher = new FakeFetcher();
    private FederationSigningKey ownKey;
    private FederationKeyResolver resolver;

    @BeforeEach
    void setUp() {
        ownKey = new FederationSigningKey(new FilesystemBlobStore(root.toString()), "secret");
        resolver = resolver(true);
    }

    @Test
    @DisplayName("The first call fetches, the second comes from the cache")
    void cached() {
        ECKey key = fetcher.publish(DOMAIN);

        assertThat(resolver.resolve(DOMAIN, key.getKeyID())).hasValue(key);
        assertThat(resolver.resolve(DOMAIN, key.getKeyID())).hasValue(key);
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(1);
    }

    @Test
    @DisplayName("The domain is compared in lower case, and a malformed one is no key and no fetch")
    void domains() {
        ECKey key = fetcher.publish(DOMAIN);

        assertThat(resolver.resolve("B.Example", key.getKeyID())).hasValue(key);
        assertThat(resolver.resolve("127.0.0.1", key.getKeyID())).isEmpty();
        assertThat(resolver.resolve(null, key.getKeyID())).isEmpty();
        assertThat(resolver.resolve(DOMAIN, null)).isEmpty();
        assertThat(fetcher.calls("127.0.0.1")).isZero();
    }

    @Test
    @DisplayName("A max-age below the floor is raised to it, one above the ceiling is cut to it, none means the ceiling")
    void cacheTimes() {
        ECKey key = fetcher.publish(DOMAIN, Duration.ofSeconds(10));
        resolver.resolve(DOMAIN, key.getKeyID());
        clock.advance(Duration.ofSeconds(59));
        resolver.resolve(DOMAIN, key.getKeyID());
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(1);
        clock.advance(Duration.ofSeconds(1));
        resolver.resolve(DOMAIN, key.getKeyID());
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);

        fetcher.publish("c.example", Duration.ofDays(1));
        resolver.resolve("c.example", fetcher.keyId("c.example"));
        clock.advance(Duration.ofMinutes(59));
        resolver.resolve("c.example", fetcher.keyId("c.example"));
        assertThat(fetcher.calls("c.example")).isEqualTo(1);
        clock.advance(Duration.ofMinutes(1));
        resolver.resolve("c.example", fetcher.keyId("c.example"));
        assertThat(fetcher.calls("c.example")).isEqualTo(2);

        fetcher.publish("d.example", null);
        resolver.resolve("d.example", fetcher.keyId("d.example"));
        clock.advance(Duration.ofMinutes(59));
        resolver.resolve("d.example", fetcher.keyId("d.example"));
        assertThat(fetcher.calls("d.example")).isEqualTo(1);
    }

    @Test
    @DisplayName("A failure is remembered for 30 seconds, then the server is asked again")
    void negativeCache() {
        fetcher.fail(DOMAIN, Failure.UNREACHABLE);

        assertThat(resolver.resolve(DOMAIN, "k")).isEmpty();
        clock.advance(Duration.ofSeconds(29));
        assertThat(resolver.resolve(DOMAIN, "k")).isEmpty();
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(1);

        ECKey key = fetcher.publish(DOMAIN);
        clock.advance(Duration.ofSeconds(1));
        assertThat(resolver.resolve(DOMAIN, key.getKeyID())).hasValue(key);
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);
    }

    @Test
    @DisplayName("An overloaded fetcher is not remembered")
    void overloadedIsNotCached() {
        fetcher.fail(DOMAIN, Failure.OVERLOADED);

        assertThat(resolver.resolve(DOMAIN, "k")).isEmpty();
        ECKey key = fetcher.publish(DOMAIN);

        assertThat(resolver.resolve(DOMAIN, key.getKeyID())).hasValue(key);
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);
    }

    @Test
    @DisplayName("An unknown key id causes one refetch per cooldown, not one per call")
    void refetchOnUnknownKey() {
        ECKey first = fetcher.publish(DOMAIN);
        resolver.resolve(DOMAIN, first.getKeyID());
        ECKey rotated = fetcher.publish(DOMAIN);

        assertThat(resolver.resolve(DOMAIN, rotated.getKeyID())).isEmpty();
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(1);

        clock.advance(Duration.ofSeconds(60));
        assertThat(resolver.resolve(DOMAIN, rotated.getKeyID())).hasValue(rotated);
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);

        assertThat(resolver.resolve(DOMAIN, "unknown")).isEmpty();
        clock.advance(Duration.ofSeconds(30));
        assertThat(resolver.resolve(DOMAIN, "another")).isEmpty();
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);
    }

    @Test
    @DisplayName("A failed domain does not turn an unknown key into a refetch before the failure expires")
    void unknownKeyOfAFailedDomain() {
        fetcher.fail(DOMAIN, Failure.BAD_RESPONSE);

        resolver.resolve(DOMAIN, "a");
        clock.advance(Duration.ofSeconds(20));
        resolver.resolve(DOMAIN, "b");

        assertThat(fetcher.calls(DOMAIN)).isEqualTo(1);
    }

    @Test
    @DisplayName("Only 30 domains a minute are fetched for the first time; the rest is refused until the minute is over")
    void newDomainLimit() {
        for (int i = 0; i < 30; i++) {
            fetcher.publish("d" + i + ".example");
            resolver.resolve("d" + i + ".example", fetcher.keyId("d" + i + ".example"));
        }
        ECKey late = fetcher.publish("late.example");

        assertThat(resolver.resolve("late.example", late.getKeyID())).isEmpty();
        assertThat(fetcher.calls("late.example")).isZero();
        // a refusal is not remembered: it neither blocks the domain after the minute nor takes a place in the cache
        clock.advance(Duration.ofSeconds(59));
        assertThat(resolver.resolve("late.example", late.getKeyID())).isEmpty();
        assertThat(fetcher.calls("late.example")).isZero();

        clock.advance(Duration.ofSeconds(1));
        assertThat(resolver.resolve("late.example", late.getKeyID())).hasValue(late);
    }

    @Test
    @DisplayName("A domain that has answered before is not a new one: its refresh is not limited")
    void knownDomainsAreNotLimited() {
        ECKey key = fetcher.publish(DOMAIN);
        resolver.resolve(DOMAIN, key.getKeyID());
        clock.advance(Duration.ofMinutes(59));
        for (int i = 0; i < 30; i++) {
            fetcher.publish("d" + i + ".example");
            resolver.resolve("d" + i + ".example", fetcher.keyId("d" + i + ".example"));
        }

        clock.advance(Duration.ofMinutes(1));

        assertThat(resolver.resolve(DOMAIN, key.getKeyID())).hasValue(key);
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);
    }

    @Test
    @DisplayName("A domain that failed counts against the limit again when its failure has expired")
    void failedDomainsAreNotExempt() {
        for (int i = 0; i < 30; i++) {
            fetcher.fail("f" + i + ".example", Failure.UNREACHABLE);
            resolver.resolve("f" + i + ".example", "k");
        }
        clock.advance(Duration.ofSeconds(30));

        assertThat(resolver.resolve("f0.example", "k")).isEmpty();
        assertThat(fetcher.calls("f0.example")).isEqualTo(1);
    }

    @Test
    @DisplayName("A failed refetch for an unknown key keeps the keys that are known, and starts the cooldown anew")
    void failedRefetchKeepsKnownKeys() {
        ECKey known = fetcher.publish(DOMAIN);
        resolver.resolve(DOMAIN, known.getKeyID());
        fetcher.fail(DOMAIN, Failure.UNREACHABLE);
        clock.advance(Duration.ofSeconds(60));

        assertThat(resolver.resolve(DOMAIN, "unknown")).isEmpty();
        assertThat(resolver.resolve(DOMAIN, known.getKeyID())).hasValue(known);
        assertThat(resolver.resolve(DOMAIN, "unknown")).isEmpty();
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(2);

        fetcher.fail(DOMAIN, Failure.OVERLOADED);
        clock.advance(Duration.ofSeconds(60));
        assertThat(resolver.resolve(DOMAIN, "unknown")).isEmpty();
        assertThat(resolver.resolve(DOMAIN, known.getKeyID())).hasValue(known);
    }

    @Test
    @DisplayName("Callers that ask for one domain at the same time share one fetch")
    void singleFlight() throws Exception {
        ECKey key = fetcher.publish(DOMAIN);
        CountDownLatch inside = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        fetcher.block(inside, release);
        ExecutorService executor = Executors.newFixedThreadPool(10);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            results.add(executor.submit(() -> resolver.resolve(DOMAIN, key.getKeyID()).isPresent()));
            inside.await();
            for (int i = 0; i < 9; i++) {
                results.add(executor.submit(() -> resolver.resolve(DOMAIN, key.getKeyID()).isPresent()));
            }
            // the other nine have either joined the fetch or will find the cache
            Thread.sleep(200);
            release.countDown();
            for (Future<Boolean> result : results) {
                assertThat(result.get()).isTrue();
            }
        } finally {
            executor.shutdownNow();
        }
        assertThat(fetcher.calls(DOMAIN)).isEqualTo(1);
    }

    @Test
    @DisplayName("An own domain is answered with the own key, without a fetch; another key id is no key")
    void ownDomain() {
        FederationKeyResolver own = resolver(true);

        assertThat(own.resolve("imagey.cloud", ownKey.keyId())).hasValue(ownKey.publicKey());
        assertThat(own.resolve("IMAGEY.cloud", "other")).isEmpty();
        assertThat(fetcher.calls("imagey.cloud")).isZero();
    }

    @Test
    @DisplayName("While federation is off there is no key and no fetch")
    void disabled() {
        ECKey key = fetcher.publish(DOMAIN);

        assertThat(resolver(false).resolve(DOMAIN, key.getKeyID())).isEmpty();
        assertThat(fetcher.calls(DOMAIN)).isZero();
    }

    @Test
    @DisplayName("CDI needs the no-argument constructor")
    void noArgConstructor() {
        assertThat(new FederationKeyResolver()).isNotNull();
    }

    private FederationKeyResolver resolver(boolean enabled) {
        FederationSettings settings = new FederationSettings(enabled, List.of(new DomainName("https://imagey.cloud")));
        return new FederationKeyResolver(settings, ownKey, fetcher, clock);
    }

    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-06T12:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static final class FakeFetcher implements FederationKeyFetcher {
        private final Map<String, FetchResult> results = new HashMap<>();
        private final Map<String, ECKey> keys = new HashMap<>();
        private final Map<String, AtomicInteger> calls = new HashMap<>();
        private CountDownLatch inside;
        private CountDownLatch release;

        ECKey publish(String domain) {
            return publish(domain, Duration.ofHours(1));
        }

        synchronized ECKey publish(String domain, Duration maxAge) {
            try {
                ECKey key = new ECKeyGenerator(Curve.P_256).keyIDFromThumbprint(true).generate().toPublicJWK();
                keys.put(domain, key);
                results.put(domain, FetchResult.success(List.of(key), maxAge));
                return key;
            } catch (com.nimbusds.jose.JOSEException e) {
                throw new IllegalStateException(e);
            }
        }

        synchronized void fail(String domain, Failure failure) {
            results.put(domain, FetchResult.failure(failure));
        }

        synchronized String keyId(String domain) {
            return keys.get(domain).getKeyID();
        }

        synchronized int calls(String domain) {
            return calls.getOrDefault(domain, new AtomicInteger()).get();
        }

        void block(CountDownLatch entered, CountDownLatch gate) {
            this.inside = entered;
            this.release = gate;
        }

        @Override
        public FetchResult fetch(String domain) {
            CountDownLatch toRelease;
            synchronized (this) {
                calls.computeIfAbsent(domain, key -> new AtomicInteger()).incrementAndGet();
                toRelease = release;
            }
            if (toRelease != null) {
                inside.countDown();
                try {
                    toRelease.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            synchronized (this) {
                return results.get(domain);
            }
        }
    }
}
