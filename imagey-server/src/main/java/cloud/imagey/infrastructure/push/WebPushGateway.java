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
package cloud.imagey.infrastructure.push;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.infrastructure.common.Base64Url;

/**
 * Sends one Web Push message over HTTP (RFC 8030), encrypted with {@link WebPushEncryption} and
 * authenticated with a fresh {@link VapidJwt} on every call - the JDK HTTP client only, no third-party
 * web-push library.
 */
@ApplicationScoped
public class WebPushGateway implements PushGateway {

    private static final Logger LOG = LogManager.getLogger(WebPushGateway.class);

    private static final String CONTENT_ENCODING = "aes128gcm";
    private static final String URGENCY_HIGH = "high";
    private static final String URGENCY_NORMAL = "normal";
    /** How long the push service should keep retrying delivery, in seconds - 24h. */
    private static final long MESSAGE_TTL_SECONDS = 86_400;
    /** How long a VAPID JWT stays valid before it must be re-signed - RFC 8292 recommends well under 24h. */
    private static final Duration VAPID_JWT_LIFETIME = Duration.ofHours(12);
    /** A hanging push service must not block the asynchronous observer's thread indefinitely. */
    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final int HTTP_NOT_FOUND = 404;
    private static final int HTTP_GONE = 410;
    private static final int HTTP_OK_MIN = 200;
    private static final int HTTP_OK_MAX_EXCLUSIVE = 300;

    @Inject
    private VapidKeys vapidKeys;

    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();

    @Override
    public Result send(String endpoint, String p256dh, String auth, String payload, boolean highUrgency) {
        try {
            byte[] body = WebPushEncryption.encrypt(payload.getBytes(UTF_8), Base64Url.decode(p256dh), Base64Url.decode(auth));
            String authorization = VapidJwt.authorizationHeader(vapidKeys, audienceOf(endpoint), Instant.now().plus(VAPID_JWT_LIFETIME));
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                .header("Content-Encoding", CONTENT_ENCODING)
                .header("TTL", String.valueOf(MESSAGE_TTL_SECONDS))
                .header("Urgency", highUrgency ? URGENCY_HIGH : URGENCY_NORMAL)
                .header("Authorization", authorization)
                .timeout(TIMEOUT)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
            return handle(httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode());
        } catch (IOException | IllegalStateException | IllegalArgumentException e) {
            LOG.warn("Failed to send a push notification", e);
            return Result.ERROR;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            LOG.warn("Interrupted while sending a push notification", e);
            return Result.ERROR;
        }
    }

    private static Result handle(int status) {
        if (status == HTTP_NOT_FOUND || status == HTTP_GONE) {
            return Result.GONE;
        }
        if (status < HTTP_OK_MIN || status >= HTTP_OK_MAX_EXCLUSIVE) {
            // Never the endpoint (carries a bearer-like token) or the payload - both may be sensitive.
            LOG.warn("Push service responded with status {}", status);
            return Result.ERROR;
        }
        return Result.SENT;
    }

    private static String audienceOf(String endpoint) {
        URI uri = URI.create(endpoint);
        int port = uri.getPort();
        return port < 0 ? uri.getScheme() + "://" + uri.getHost() : uri.getScheme() + "://" + uri.getHost() + ":" + port;
    }
}
