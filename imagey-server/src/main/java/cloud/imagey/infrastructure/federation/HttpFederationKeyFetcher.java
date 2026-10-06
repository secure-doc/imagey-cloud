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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.hc.client5.http.ConnectTimeoutException;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.SystemDefaultDnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ClassicHttpResponse;
import org.apache.hc.core5.http.Header;
import org.apache.hc.core5.http.HttpStatus;
import org.apache.hc.core5.util.Timeout;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;

import cloud.imagey.infrastructure.federation.FetchResult.Failure;

/**
 * Fetches {@code https://<domain>/users/federation/key} of a foreign server, hardened against
 * being used as a proxy into the own network (SSRF): the addresses are checked by the DNS resolver
 * the connection itself uses, so there is no gap between check and connect (DNS rebinding); redirects
 * are not followed; time, size and number of keys are bounded; the work runs on a small pool whose
 * overflow is rejected instead of queued without bound.
 */
@ApplicationScoped
public class HttpFederationKeyFetcher implements FederationKeyFetcher {

    private static final Logger LOG = LogManager.getLogger(HttpFederationKeyFetcher.class);
    private static final String PATH = "/users/federation/key";
    private static final Pattern MAX_AGE = Pattern.compile("(?:^|[\\s,])max-age=(\\d{1,9})(?:$|[\\s,;])");
    private static final int MAX_BODY = 16 * 1024;
    private static final int MAX_KEYS = 5;
    private static final int THREADS = 4;
    private static final int QUEUE = 32;
    private static final int MAX_PER_ROUTE = 2;
    private static final int MAX_TOTAL = 20;
    private static final Timeout CONNECT_TIMEOUT = Timeout.ofSeconds(2);
    private static final Timeout RESPONSE_TIMEOUT = Timeout.ofSeconds(3);
    private static final long DEADLINE_SECONDS = 5;

    // host[:port] of servers that may be reached over http and at any address (local development, E2E)
    @Inject
    @ConfigProperty(name = "federation.insecure-domains", defaultValue = "")
    private String insecureDomainsConfig;

    private Set<String> insecureDomains;
    // refuses non-public addresses; the other one is only for the insecure domains (host AND port)
    private CloseableHttpClient client;
    private CloseableHttpClient insecureClient;
    private ThreadPoolExecutor pool;

    @PostConstruct
    void start() {
        insecureDomains = new HashSet<>();
        Arrays.stream(insecureDomainsConfig.split(","))
            .map(String::trim)
            .filter(domain -> !domain.isEmpty())
            .forEach(domain -> FederationDomain.normalize(domain).ifPresent(insecureDomains::add));
        client = newClient(new CheckingDnsResolver());
        insecureClient = newClient(SystemDefaultDnsResolver.INSTANCE);
        pool = new ThreadPoolExecutor(THREADS, THREADS, 0, TimeUnit.SECONDS, new LinkedBlockingQueue<>(QUEUE), runnable -> {
            Thread thread = new Thread(runnable, "federation-key-fetcher");
            thread.setDaemon(true);
            return thread;
        });
    }

    private static CloseableHttpClient newClient(DnsResolver dnsResolver) {
        PoolingHttpClientConnectionManager connections = PoolingHttpClientConnectionManagerBuilder.create()
            .setDnsResolver(dnsResolver)
            .setMaxConnPerRoute(MAX_PER_ROUTE)
            .setMaxConnTotal(MAX_TOTAL)
            .setDefaultConnectionConfig(connectionConfig())
            .build();
        return HttpClients.custom()
            .setConnectionManager(connections)
            .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(RESPONSE_TIMEOUT).build())
            .disableRedirectHandling()
            .disableAutomaticRetries()
            .disableCookieManagement()
            .build();
    }

    private static ConnectionConfig connectionConfig() {
        return ConnectionConfig.custom().setConnectTimeout(CONNECT_TIMEOUT).setSocketTimeout(RESPONSE_TIMEOUT).build();
    }

    @PreDestroy
    void stop() {
        pool.shutdownNow();
        for (CloseableHttpClient closing : new CloseableHttpClient[] {client, insecureClient}) {
            try {
                closing.close();
            } catch (IOException e) {
                LOG.debug("Closing the federation HTTP client failed", e);
            }
        }
    }

    @Override
    public FetchResult fetch(String domain) {
        String normalized = FederationDomain.normalize(domain).orElse(null);
        if (normalized == null) {
            return FetchResult.failure(Failure.INVALID_DOMAIN);
        }
        HttpGet request = newRequest(normalized);
        Future<FetchResult> future;
        try {
            future = pool.submit(() -> doFetch(normalized, request));
        } catch (RejectedExecutionException e) {
            return FetchResult.failure(Failure.OVERLOADED);
        }
        try {
            return future.get(DEADLINE_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            abandon(request, future);
            return FetchResult.failure(Failure.TIMEOUT);
        } catch (InterruptedException e) {
            abandon(request, future);
            Thread.currentThread().interrupt();
            return FetchResult.failure(Failure.UNREACHABLE);
        } catch (ExecutionException e) {
            LOG.warn("Fetching the federation key of {} failed unexpectedly", normalized, e.getCause());
            return FetchResult.failure(Failure.UNREACHABLE);
        }
    }

    // Aborting the request closes its connection, which ends a read that blocks (a server that drips a
    // byte every few seconds); only then the thread of the pool is free again.
    private static void abandon(HttpGet request, Future<FetchResult> future) {
        request.abort();
        future.cancel(true);
    }

    private HttpGet newRequest(String domain) {
        String scheme = insecureDomains.contains(domain) ? "http" : "https";
        HttpGet request = new HttpGet(URI.create(scheme + "://" + domain + PATH));
        request.setHeader("Accept", "application/jwk-set+json, application/json");
        return request;
    }

    private FetchResult doFetch(String domain, HttpGet request) {
        try {
            return (insecureDomains.contains(domain) ? insecureClient : client).execute(request, this::read);
        } catch (IOException e) {
            Failure failure = failureOf(e);
            LOG.info("Federation key of {} not available: {}", domain, failure);
            LOG.debug("Federation key of {} not available", domain, e);
            return FetchResult.failure(failure);
        }
    }

    private FetchResult read(ClassicHttpResponse response) throws IOException {
        if (response.getCode() != HttpStatus.SC_OK || response.getEntity() == null || !isJson(response.getFirstHeader("Content-Type"))) {
            // thrown, so that the client drops the connection instead of reading the body to its end
            throw new BadResponseException();
        }
        try {
            String body = readBounded(response.getEntity().getContent());
            List<ECKey> keys = parse(body);
            return keys.isEmpty() ? FetchResult.failure(Failure.BAD_RESPONSE)
                : FetchResult.success(keys, maxAge(response.getFirstHeader("Cache-Control")));
        } catch (ParseException e) {
            return FetchResult.failure(Failure.BAD_RESPONSE);
        }
    }

    private static boolean isJson(Header contentType) {
        if (contentType == null) {
            return false;
        }
        String value = contentType.getValue().toLowerCase(Locale.ROOT);
        return value.startsWith("application/jwk-set+json") || value.startsWith("application/json");
    }

    // Throwing out of the response handler (instead of reading on) makes the client drop the connection
    // rather than drain it.
    private static String readBounded(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[MAX_BODY / 2];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
            if (out.size() > MAX_BODY) {
                throw new BodyTooLargeException();
            }
        }
        return out.toString(StandardCharsets.UTF_8);
    }

    // Only public P-256 keys with an id: anything else means the server is not what we talk to.
    private static List<ECKey> parse(String body) throws ParseException {
        List<JWK> all = JWKSet.parse(body).getKeys();
        if (all.size() > MAX_KEYS) {
            throw new ParseException("Too many keys", 0);
        }
        List<ECKey> keys = new ArrayList<>();
        for (JWK jwk : all) {
            if (!(jwk instanceof ECKey ec) || ec.isPrivate() || !Curve.P_256.equals(ec.getCurve()) || !hasThumbprintAsId(ec)) {
                throw new ParseException("Not a public P-256 key with its thumbprint as id", 0);
            }
            keys.add(ec);
        }
        return keys;
    }

    // The id is the RFC 7638 thumbprint (ADR 0013): the same id can only ever be the same key.
    private static boolean hasThumbprintAsId(ECKey key) {
        try {
            return key.computeThumbprint().toString().equals(key.getKeyID());
        } catch (JOSEException e) {
            return false;
        }
    }

    private static Duration maxAge(Header cacheControl) {
        if (cacheControl == null) {
            return null;
        }
        Matcher matcher = MAX_AGE.matcher(cacheControl.getValue().toLowerCase(Locale.ROOT));
        return matcher.find() ? Duration.ofSeconds(Long.parseLong(matcher.group(1))) : null;
    }

    private static Failure failureOf(IOException e) {
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            if (cause instanceof ForbiddenAddressException) {
                return Failure.FORBIDDEN_ADDRESS;
            }
            if (cause instanceof BodyTooLargeException || cause instanceof BadResponseException) {
                return Failure.BAD_RESPONSE;
            }
            if (cause instanceof SocketTimeoutException || cause instanceof ConnectTimeoutException) {
                return Failure.TIMEOUT;
            }
        }
        return Failure.UNREACHABLE;
    }

    /** Resolves like the system and refuses non-public addresses. */
    static final class CheckingDnsResolver implements DnsResolver {

        private final DnsResolver delegate = SystemDefaultDnsResolver.INSTANCE;

        @Override
        public InetAddress[] resolve(String host) throws UnknownHostException {
            InetAddress[] addresses = delegate.resolve(host);
            for (InetAddress address : addresses) {
                if (AddressPolicy.isForbidden(address)) {
                    throw new ForbiddenAddressException(host);
                }
            }
            return addresses;
        }

        @Override
        public String resolveCanonicalHostname(String host) throws UnknownHostException {
            return delegate.resolveCanonicalHostname(host);
        }
    }

    /** An address of the host is not public. */
    static final class ForbiddenAddressException extends UnknownHostException {
        private static final long serialVersionUID = 1L;

        ForbiddenAddressException(String host) {
            super(host);
        }
    }

    /** The answer is not the key set of a server. */
    static final class BadResponseException extends IOException {
        private static final long serialVersionUID = 1L;
    }

    /** The body is larger than a key set may be. */
    static final class BodyTooLargeException extends IOException {
        private static final long serialVersionUID = 1L;
    }
}
