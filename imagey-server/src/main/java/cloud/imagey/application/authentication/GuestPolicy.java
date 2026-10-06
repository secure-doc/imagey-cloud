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
package cloud.imagey.application.authentication;

import java.util.List;
import java.util.Optional;

/**
 * What a guest session (a user of another server, ADR 0013 A4) may do. A guest is never the
 * {@code owner} of anything except a short allowlist of routes below its own user id; everything
 * else it reaches only as {@code member}, through the key chain like any other user.
 *
 * <p>Pure logic on the path segments below {@code /users}: {@code segments[0]} is the user id.
 */
public final class GuestPolicy {

    private static final String BEARER = "Bearer ";
    private static final String CONTACT_REQUESTS = "contact-requests";
    private static final String DOCUMENTS = "documents";
    // {owner}/documents/{id}
    private static final int DOCUMENT_SIZE = 3;
    // {owner}/documents/{id}/messages
    private static final int MESSAGES_SIZE = 4;
    // {owner}/documents/{id}/{files|keys|messages}/{x}
    private static final int SUBRESOURCE_SIZE = 5;

    private GuestPolicy() {
    }

    /** Whether the guest may act as {@code owner} of its own path with this method. */
    public static boolean allowsOwner(String method, List<String> segments) {
        if (segments.size() < 2 || !CONTACT_REQUESTS.equals(segments.get(1))) {
            return false;
        }
        return switch (segments.size()) {
            case 2 -> "GET".equals(method);
            case 3 -> "PUT".equals(method) || "DELETE".equals(method);
            default -> false;
        };
    }

    /**
     * Whether a cross-origin guest may call this route at all: the owner allowlist plus every
     * route that is open to {@code member}s. {@code method} is the method that will be used, so for
     * a preflight the value of {@code Access-Control-Request-Method}.
     */
    public static boolean isGuestRoute(String method, List<String> segments) {
        return allowsOwner(method, segments) || isMemberRoute(method, segments);
    }

    private static boolean isMemberRoute(String method, List<String> segments) {
        if (segments.size() < DOCUMENT_SIZE || !DOCUMENTS.equals(segments.get(1))) {
            return false;
        }
        if (segments.size() == DOCUMENT_SIZE) {
            return "GET".equals(method);
        }
        return switch (segments.get(DOCUMENT_SIZE)) {
            case "files", "keys" -> segments.size() == SUBRESOURCE_SIZE && "GET".equals(method);
            case "messages" -> isMessageRoute(method, segments.size());
            default -> false;
        };
    }

    private static boolean isMessageRoute(String method, int size) {
        if (size == MESSAGES_SIZE) {
            return "GET".equals(method) || "HEAD".equals(method) || "POST".equals(method);
        }
        // HEAD on a single message is answered by the GET method, so it is a guest route as well.
        return size == SUBRESOURCE_SIZE && ("GET".equals(method) || "HEAD".equals(method));
    }

    /**
     * Whether the session token is read from the {@code Authorization} header (a guest) instead of
     * the cookie. The two ways exclude each other: with an {@code Authorization} header the cookie
     * is not looked at.
     */
    public static boolean usesBearer(boolean federationEnabled, String authorization) {
        return federationEnabled && authorization != null;
    }

    /** The token of a {@code Bearer} header, empty for any other (or malformed) header. */
    public static Optional<String> bearerToken(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return Optional.empty();
        }
        return Optional.of(authorization.substring(BEARER.length()).trim()).filter(token -> !token.isEmpty());
    }
}
