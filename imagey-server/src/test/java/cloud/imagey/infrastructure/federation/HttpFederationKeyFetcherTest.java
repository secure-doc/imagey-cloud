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
package cloud.imagey.infrastructure.federation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import cloud.imagey.infrastructure.federation.FetchResult.Failure;

// A real HTTP server on the loopback address stands for the foreign server. Its domain is
// "keys.localhost:<port>", which the system resolves to the loopback address, too.
class HttpFederationKeyFetcherTest {

    private static final String JWK_SET = "application/jwk-set+json";

    private HttpServer server;
    private final AtomicReference<HttpHandler> handler = new AtomicReference<>(exchange -> exchange.close());
    private HttpFederationKeyFetcher fetcher;
    private String domain;
    private final AtomicInteger redirectTargetCalls = new AtomicInteger();

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/", exchange -> handler.get().handle(exchange));
        server.start();
        domain = "keys.localhost:" + server.getAddress().getPort();
        fetcher = fetcher(domain);
    }

    @AfterEach
    void tearDown() {
        fetcher.stop();
        server.stop(0);
    }

    @Test
    @DisplayName("A valid key set is returned with the max-age of the answer")
    void fetches() throws Exception {
        ECKey key = key();
        respond("/users/federation/key", 200, JWK_SET, new JWKSet(key).toString(), "public, max-age=120");

        FetchResult result = fetcher.fetch(domain);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.keys()).hasSize(1);
        assertThat(result.keys().get(0).getKeyID()).isEqualTo(key.getKeyID());
        assertThat(result.maxAge()).hasSeconds(120);
    }

    @Test
    @DisplayName("Without Cache-Control there is no max-age, and plain application/json is accepted")
    void withoutMaxAge() throws Exception {
        respond("/users/federation/key", 200, "application/json; charset=utf-8", new JWKSet(key()).toString(), null);

        FetchResult result = fetcher.fetch(domain);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.maxAge()).isNull();
    }

    @Test
    @DisplayName("A redirect is not followed")
    void noRedirect() {
        handler.set(exchange -> {
            exchange.getResponseHeaders().add("Location", "http://" + domain + "/elsewhere");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/elsewhere", exchange -> {
            redirectTargetCalls.incrementAndGet();
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });

        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);
        assertThat(redirectTargetCalls.get()).isZero();
    }

    @Test
    @DisplayName("Another status is a bad response")
    void status() {
        respond("/users/federation/key", 404, JWK_SET, "{}", null);

        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);
    }

    @Test
    @DisplayName("A body above 16 KiB is a bad response")
    void tooLarge() {
        respond("/users/federation/key", 200, JWK_SET, "{\"keys\":[],\"x\":\"" + "a".repeat(17 * 1024) + "\"}", null);

        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);
    }

    @Test
    @DisplayName("Another content type, no JSON, no key and too many keys are bad responses")
    void badContent() throws Exception {
        respond("/users/federation/key", 200, "text/html", new JWKSet(key()).toString(), null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        respond("/users/federation/key", 200, JWK_SET, "not json", null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        respond("/users/federation/key", 200, JWK_SET, "{\"keys\":[]}", null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        JWKSet six = new JWKSet(List.of(key(), key(), key(), key(), key(), key()));
        respond("/users/federation/key", 200, JWK_SET, six.toString(false), null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);
    }

    @Test
    @DisplayName("A key set with a private key, another curve, no key id or an id that is not the thumbprint is a bad response")
    void badKeys() throws Exception {
        ECKey key = new ECKeyGenerator(Curve.P_256).keyIDFromThumbprint(true).generate();
        respond("/users/federation/key", 200, JWK_SET, new JWKSet(key).toString(false), null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        ECKey p384 = new ECKeyGenerator(Curve.P_384).keyIDFromThumbprint(true).generate().toPublicJWK();
        respond("/users/federation/key", 200, JWK_SET, new JWKSet(p384).toString(), null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        ECKey noId = new ECKeyGenerator(Curve.P_256).generate().toPublicJWK();
        respond("/users/federation/key", 200, JWK_SET, new JWKSet(noId).toString(), null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        ECKey wrongId = new ECKey.Builder(key.toPublicJWK()).keyID("not-the-thumbprint").build();
        respond("/users/federation/key", 200, JWK_SET, new JWKSet(wrongId).toString(), null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);

        String rsa = "{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"r\",\"n\":\"AQAB\",\"e\":\"AQAB\"}]}";
        respond("/users/federation/key", 200, JWK_SET, rsa, null);
        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.BAD_RESPONSE);
    }

    @Test
    @DisplayName("A server that does not answer in time is a timeout")
    void timeout() {
        handler.set(exchange -> {
            try {
                Thread.sleep(4_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.close();
        });

        long start = System.nanoTime();
        FetchResult result = fetcher.fetch(domain);

        assertThat(result.failure()).isEqualTo(Failure.TIMEOUT);
        assertThat((System.nanoTime() - start) / 1_000_000L).isLessThan(5_500);
    }

    @Test
    @DisplayName("A server that is not there is unreachable")
    void unreachable() {
        server.stop(0);

        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.UNREACHABLE);
    }

    @Test
    @DisplayName("Without being configured as insecure the loopback address is forbidden, and nothing is contacted")
    void forbiddenAddress() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        handler.set(exchange -> {
            calls.incrementAndGet();
            exchange.close();
        });
        HttpFederationKeyFetcher strict = fetcher("");
        try {
            assertThat(strict.fetch(domain).failure()).isEqualTo(Failure.FORBIDDEN_ADDRESS);
        } finally {
            strict.stop();
        }
        assertThat(calls.get()).isZero();
    }

    @Test
    @DisplayName("The exception for an insecure domain is for its port only, not for the other ports of the host")
    void insecureIsPerPort() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        handler.set(exchange -> {
            calls.incrementAndGet();
            exchange.close();
        });
        HttpFederationKeyFetcher other = fetcher("keys.localhost:" + (server.getAddress().getPort() + 1));
        try {
            assertThat(other.fetch(domain).failure()).isEqualTo(Failure.FORBIDDEN_ADDRESS);
        } finally {
            other.stop();
        }
        assertThat(calls.get()).isZero();
    }

    @Test
    @DisplayName("A server that drips bytes cannot hold a thread: the request is aborted at the deadline")
    void dripFeedReleasesTheThread() throws Exception {
        handler.set(exchange -> {
            exchange.getResponseHeaders().add("Content-Type", JWK_SET);
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream out = exchange.getResponseBody()) {
                for (int i = 0; i < 30; i++) {
                    out.write(' ');
                    out.flush();
                    Thread.sleep(1_000);
                }
            } catch (IOException | InterruptedException e) {
                // the client has gone
            }
        });

        assertThat(fetcher.fetch(domain).failure()).isEqualTo(Failure.TIMEOUT);

        Field poolField = HttpFederationKeyFetcher.class.getDeclaredField("pool");
        poolField.setAccessible(true);
        ThreadPoolExecutor pool = (ThreadPoolExecutor) poolField.get(fetcher);
        long deadline = System.nanoTime() + 3_000_000_000L;
        while (pool.getActiveCount() > 0 && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        assertThat(pool.getActiveCount()).isZero();
    }

    @Test
    @DisplayName("A malformed domain is invalid, without any network access")
    void invalidDomain() {
        assertThat(fetcher.fetch("127.0.0.1:" + server.getAddress().getPort()).failure()).isEqualTo(Failure.INVALID_DOMAIN);
        assertThat(fetcher.fetch("a/b.example").failure()).isEqualTo(Failure.INVALID_DOMAIN);
    }

    @Test
    @DisplayName("When all threads and the queue are busy, the fetch is refused at once as overloaded")
    void overloaded() throws Exception {
        handler.set(exchange -> {
            try {
                Thread.sleep(2_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.close();
        });
        ExecutorService callers = Executors.newFixedThreadPool(40);
        try {
            List<Future<FetchResult>> results = new ArrayList<>();
            for (int i = 0; i < 40; i++) {
                results.add(callers.submit(() -> fetcher.fetch(domain)));
            }
            long overloaded = 0;
            for (Future<FetchResult> result : results) {
                if (result.get().failure() == Failure.OVERLOADED) {
                    overloaded++;
                }
            }
            assertThat(overloaded).isGreaterThan(0);
        } finally {
            callers.shutdownNow();
        }
    }

    private void respond(String path, int status, String contentType, String body, String cacheControl) {
        handler.set(exchange -> send(exchange, status, contentType, body, cacheControl));
    }

    private static void send(HttpExchange exchange, int status, String contentType, String body, String cacheControl)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", contentType);
        if (cacheControl != null) {
            exchange.getResponseHeaders().add("Cache-Control", cacheControl);
        }
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static ECKey key() throws Exception {
        return new ECKeyGenerator(Curve.P_256).keyIDFromThumbprint(true).generate().toPublicJWK();
    }

    private static HttpFederationKeyFetcher fetcher(String insecure) throws Exception {
        HttpFederationKeyFetcher fetcher = new HttpFederationKeyFetcher();
        Field field = HttpFederationKeyFetcher.class.getDeclaredField("insecureDomainsConfig");
        field.setAccessible(true);
        field.set(fetcher, insecure);
        fetcher.start();
        return fetcher;
    }
}
