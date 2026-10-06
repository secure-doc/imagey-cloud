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

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.List;
import java.util.stream.Stream;

import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.application.ContactResource;
import cloud.imagey.application.DeviceResource;
import cloud.imagey.application.DocumentResource;
import cloud.imagey.application.MessageResource;

public class GuestPolicyTest {

    @Test
    @DisplayName("The federation key is the one public route, for reading only")
    void publicRoute() {
        assertThat(GuestPolicy.isPublicRoute("GET", List.of("federation", "key"))).isTrue();
        assertThat(GuestPolicy.isPublicRoute("HEAD", List.of("federation", "key"))).isTrue();

        assertThat(GuestPolicy.isPublicRoute("POST", List.of("federation", "key"))).isFalse();
        assertThat(GuestPolicy.isPublicRoute("GET", List.of("federation"))).isFalse();
        assertThat(GuestPolicy.isPublicRoute("GET", List.of("federation", "other"))).isFalse();
        assertThat(GuestPolicy.isPublicRoute("GET", List.of("other", "key"))).isFalse();
        assertThat(GuestPolicy.isPublicRoute("GET", List.of("federation", "key", "x"))).isFalse();
        assertThat(GuestPolicy.isPublicRoute("GET", List.of("u", "devices"))).isFalse();
    }

    @Test
    @DisplayName("A guest is owner of its contact requests only")
    void ownerAllowlist() {
        assertThat(GuestPolicy.allowsOwner("GET", List.of("u", "contact-requests"))).isTrue();
        assertThat(GuestPolicy.allowsOwner("PUT", List.of("u", "contact-requests", "c"))).isTrue();
        assertThat(GuestPolicy.allowsOwner("DELETE", List.of("u", "contact-requests", "c"))).isTrue();

        assertThat(GuestPolicy.allowsOwner("POST", List.of("u", "contact-requests"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("GET", List.of("u", "contact-requests", "c"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("PUT", List.of("u", "contact-requests"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("PUT", List.of("u", "documents", "d"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("GET", List.of("u", "devices"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("POST", List.of("u", "devices", "d", "public-keys"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("GET", List.of("u", "contact-requests", "c", "x"))).isFalse();
        assertThat(GuestPolicy.allowsOwner("GET", List.of("u"))).isFalse();
    }

    @Test
    @DisplayName("The guest routes are the owner allowlist plus the routes open to members")
    void guestRoutes() {
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents", "d"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents", "d", "files", "c"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents", "d", "keys", "k"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents", "d", "messages"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("HEAD", List.of("o", "documents", "d", "messages"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("POST", List.of("o", "documents", "d", "messages"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents", "d", "messages", "m"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("HEAD", List.of("o", "documents", "d", "messages", "m"))).isTrue();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("u", "contact-requests"))).isTrue();

        assertThat(GuestPolicy.isGuestRoute("PUT", List.of("o", "documents", "d"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("POST", List.of("o", "documents", "d", "keys"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("PUT", List.of("o", "documents", "d", "files", "c"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("DELETE", List.of("o", "documents", "d", "messages", "m"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("HEAD", List.of("o", "documents", "d", "files", "c"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents", "d", "other"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "documents"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "devices"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("GET", List.of("o", "devices", "d", "public-keys", "0"))).isFalse();
        assertThat(GuestPolicy.isGuestRoute("OPTIONS", List.of("o", "documents", "d"))).isFalse();
    }

    @Test
    @DisplayName("Every member route of the resources is a guest route, so the list cannot go stale")
    void everyMemberRouteIsAGuestRoute() {
        List<Method> memberMethods = Stream.of(DocumentResource.class, MessageResource.class)
            .flatMap(type -> Stream.of(type.getDeclaredMethods()))
            .filter(method -> method.isAnnotationPresent(RolesAllowed.class))
            .filter(method -> List.of(method.getAnnotation(RolesAllowed.class).value()).contains("member"))
            .toList();
        assertThat(memberMethods).isNotEmpty();

        for (Method method : memberMethods) {
            assertThat(GuestPolicy.isGuestRoute(httpMethod(method), segments(method)))
                .as("%s.%s", method.getDeclaringClass().getSimpleName(), method.getName())
                .isTrue();
        }
    }

    @Test
    @DisplayName("Everything the guest may do as owner exists as an owner route, and nothing else of the owner routes is open")
    void ownerRoutesOfTheResources() {
        for (Class<?> type : List.of(ContactResource.class, DeviceResource.class, DocumentResource.class)) {
            for (Method method : type.getDeclaredMethods()) {
                RolesAllowed roles = method.getAnnotation(RolesAllowed.class);
                if (roles == null || List.of(roles.value()).contains("member")) {
                    continue;
                }
                boolean contactRequestsOfGuest = type == ContactResource.class && !"POST".equals(httpMethod(method));
                assertThat(GuestPolicy.allowsOwner(httpMethod(method), segments(method)))
                    .as("%s.%s", type.getSimpleName(), method.getName())
                    .isEqualTo(contactRequestsOfGuest);
            }
        }
    }

    @Test
    @DisplayName("A bearer header is only used when federation is on")
    void bearerToken() {
        assertThat(GuestPolicy.usesBearer(true, "Bearer x")).isTrue();
        assertThat(GuestPolicy.usesBearer(true, "Basic x")).isTrue();
        assertThat(GuestPolicy.usesBearer(true, null)).isFalse();
        assertThat(GuestPolicy.usesBearer(false, "Bearer x")).isFalse();

        assertThat(GuestPolicy.bearerToken("Bearer abc")).contains("abc");
        assertThat(GuestPolicy.bearerToken("bearer abc")).contains("abc");
        assertThat(GuestPolicy.bearerToken("Basic abc")).isEmpty();
        assertThat(GuestPolicy.bearerToken("Bearer ")).isEmpty();
        assertThat(GuestPolicy.bearerToken(null)).isEmpty();
    }

    private static String httpMethod(Method method) {
        if (method.isAnnotationPresent(GET.class)) {
            return "GET";
        }
        if (method.isAnnotationPresent(POST.class)) {
            return "POST";
        }
        if (method.isAnnotationPresent(PUT.class)) {
            return "PUT";
        }
        if (method.isAnnotationPresent(DELETE.class)) {
            return "DELETE";
        }
        if (method.isAnnotationPresent(HEAD.class)) {
            return "HEAD";
        }
        throw new IllegalArgumentException(method.toString());
    }

    // The path segments of the route, with every {parameter} replaced by a placeholder value.
    private static List<String> segments(Method method) {
        String path = method.getDeclaringClass().getAnnotation(Path.class).value();
        if (method.isAnnotationPresent(Path.class)) {
            path += "/" + method.getAnnotation(Path.class).value();
        }
        return Stream.of(path.replaceAll("\\{[^}]*}", "x").split("/")).filter(s -> !s.isEmpty()).toList();
    }
}
