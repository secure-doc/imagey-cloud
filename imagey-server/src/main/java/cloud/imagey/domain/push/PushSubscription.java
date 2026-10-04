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
package cloud.imagey.domain.push;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;

import jakarta.validation.ValidationException;

import cloud.imagey.infrastructure.common.Base64Url;

/**
 * A single device's Web Push subscription (RFC 8030), stored verbatim as {@code
 * devices/{deviceId}/push-subscription.json} (see {@code cloud.imagey.domain.user.DeviceRepository}).
 * The server sends POST requests to {@code endpoint}, so it is validated against an operator-configured
 * host allowlist ({@code push.allowed-hosts}) rather than trusted outright - see {@link #parse}.
 */
public record PushSubscription(String endpoint, String p256dh, String auth) {

    /** The uncompressed P-256 public key point (RFC 8291): 1 leading byte plus two 32-byte coordinates. */
    private static final int P256DH_LENGTH = 65;
    /** The client's 16-byte authentication secret (RFC 8291). */
    private static final int AUTH_LENGTH = 16;

    public PushSubscription {
        requireHttps(endpoint);
        requireLength("p256dh", p256dh, P256DH_LENGTH);
        requireLength("auth", auth, AUTH_LENGTH);
    }

    /**
     * Validates {@code endpoint}'s host against {@code allowedHosts} (each either an exact host or,
     * prefixed with {@code *.}, a wildcard suffix match) before delegating to the canonical
     * constructor for the rest. The allowlist check lives here rather than in the constructor because
     * it depends on server configuration ({@code push.allowed-hosts}), which a plain record cannot
     * inject - see {@code DeviceResource}.
     *
     * @throws ValidationException if the endpoint's scheme, host or either key's length is invalid
     */
    public static PushSubscription parse(String endpoint, String p256dh, String auth, List<String> allowedHosts) {
        requireAllowedHost(endpoint, allowedHosts);
        return new PushSubscription(endpoint, p256dh, auth);
    }

    private static void requireHttps(String endpoint) {
        URI uri = parseUri(endpoint);
        if (!"https".equals(uri.getScheme())) {
            throw new ValidationException("Push subscription endpoint must be https");
        }
    }

    private static void requireAllowedHost(String endpoint, List<String> allowedHosts) {
        String host = parseUri(endpoint).getHost();
        boolean allowed = host != null && allowedHosts.stream().anyMatch(pattern -> matches(host, pattern));
        if (!allowed) {
            throw new ValidationException("Push subscription endpoint host is not allowed: " + host);
        }
    }

    private static boolean matches(String host, String pattern) {
        if (pattern.startsWith("*.")) {
            // The dot stays part of the suffix, so a host can only satisfy endsWith by being
            // strictly longer than it - the bare domain itself (without a subdomain) never matches.
            String dottedSuffix = pattern.substring(1);
            return host.length() > dottedSuffix.length() && host.endsWith(dottedSuffix);
        }
        return host.equals(pattern);
    }

    private static URI parseUri(String endpoint) {
        try {
            return new URI(endpoint);
        } catch (URISyntaxException e) {
            throw new ValidationException("Invalid push subscription endpoint: " + endpoint);
        }
    }

    private static void requireLength(String name, String base64UrlValue, int expectedBytes) {
        byte[] decoded;
        try {
            decoded = Base64Url.decode(base64UrlValue);
        } catch (IllegalArgumentException e) {
            throw new ValidationException("Invalid " + name + ": not base64url");
        }
        if (decoded.length != expectedBytes) {
            throw new ValidationException(name + " must decode to " + expectedBytes + " bytes");
        }
    }
}
