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
package cloud.imagey.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.junit.GreenMail;

// ADR 0013 A4: foreign origins may call the guest routes with a bearer token and without
// credentials; the origins of secure-doc.urls keep the credentials CORS they always had.
// java.net.http is used because the JAX-RS client does not let a test set the Origin header.
@GreenMail
@MonoMeecrowaveConfig
public class CorsFilterTest {

    private static final String FOREIGN = "https://elsewhere.example";
    private static final String OWN = "https://imagey.cloud";
    private static final String GUEST_ROUTE = "/users/u/documents/d/messages";
    private static final String OWNER_ROUTE = "/users/u/devices";
    private static final String PUBLIC_ROUTE = "/users/federation/key";

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Test
    @DisplayName("A preflight of a foreign origin for a guest route is answered with a wildcard and no credentials")
    void preflightOfGuestRoute() throws Exception {
        HttpResponse<String> response = send("OPTIONS", GUEST_ROUTE, FOREIGN, "POST");

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(header(response, "Access-Control-Allow-Origin")).isEqualTo("*");
        assertThat(header(response, "Access-Control-Allow-Credentials")).isNull();
        assertThat(header(response, "Access-Control-Allow-Headers"))
            .contains("authorization").contains("access-path").contains("prefer").contains("notify");
        assertThat(header(response, "Access-Control-Max-Age")).isEqualTo("7200");
        assertThat(header(response, "Vary")).isEqualTo("Origin");
    }

    @Test
    @DisplayName("A preflight of a foreign origin for an owner route gets no CORS headers")
    void preflightOfOwnerRoute() throws Exception {
        HttpResponse<String> response = send("OPTIONS", OWNER_ROUTE, FOREIGN, "GET");

        assertThat(header(response, "Access-Control-Allow-Origin")).isNull();
        assertThat(header(response, "Access-Control-Allow-Methods")).isNull();
    }

    @Test
    @DisplayName("A rejected request of a foreign origin still carries the CORS headers, so that the client can read the status")
    void unauthorizedResponseIsReadable() throws Exception {
        HttpResponse<String> response = send("GET", GUEST_ROUTE, FOREIGN, null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(header(response, "Access-Control-Allow-Origin")).isEqualTo("*");
        assertThat(header(response, "Access-Control-Allow-Credentials")).isNull();
    }

    @Test
    @DisplayName("A foreign origin gets no CORS headers on an owner route")
    void ownerRouteIsClosed() throws Exception {
        HttpResponse<String> response = send("GET", OWNER_ROUTE, FOREIGN, null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(header(response, "Access-Control-Allow-Origin")).isNull();
    }

    @Test
    @DisplayName("The origins of secure-doc.urls keep their credentials headers, without a wildcard")
    void ownOriginKeepsItsHeaders() throws Exception {
        HttpResponse<String> response = send("GET", GUEST_ROUTE, OWN, null);

        assertThat(header(response, "Access-Control-Allow-Origin")).isEqualTo(OWN);
        assertThat(header(response, "Access-Control-Allow-Credentials")).isEqualTo("true");
        assertThat(response.headers().allValues("Access-Control-Allow-Origin")).hasSize(1);
        assertThat(header(response, "Access-Control-Allow-Headers"))
            .contains("access-path").contains("prefer").contains("notify");
        assertThat(header(response, "Access-Control-Expose-Headers")).contains("Last-Modified");
        assertThat(header(response, "Access-Control-Max-Age")).isNull();
    }

    @Test
    @DisplayName("A request without Origin gets no guest headers")
    void withoutOrigin() throws Exception {
        HttpResponse<String> response = send("GET", GUEST_ROUTE, null, null);

        assertThat(header(response, "Access-Control-Allow-Origin")).isNull();
    }

    @Test
    @DisplayName("The federation key is readable from any origin: exactly one wildcard, no credentials")
    void publicKeyForForeignOrigin() throws Exception {
        HttpResponse<String> response = send("GET", PUBLIC_ROUTE, FOREIGN, null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().allValues("Access-Control-Allow-Origin")).containsExactly("*");
        assertThat(header(response, "Access-Control-Allow-Credentials")).isNull();
        assertThat(header(response, "Vary")).isEqualTo("Origin");
    }

    @Test
    @DisplayName("The federation key of an own origin has the wildcard only, not the origin on top of it")
    void publicKeyForOwnOrigin() throws Exception {
        HttpResponse<String> response = send("GET", PUBLIC_ROUTE, OWN, null);

        assertThat(response.headers().allValues("Access-Control-Allow-Origin")).containsExactly("*");
        assertThat(header(response, "Access-Control-Allow-Credentials")).isNull();
    }

    @Test
    @DisplayName("Without an Origin header, but on an own host, the federation key still has one wildcard")
    void publicKeyWithoutOrigin() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + config.getHttpPort() + PUBLIC_ROUTE))
            .header("X-Forwarded-Host", "imagey.cloud")
            .header("X-Forwarded-Proto", "https")
            .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.headers().allValues("Access-Control-Allow-Origin")).containsExactly("*");
    }

    @Test
    @DisplayName("A preflight for the federation key is answered, from a foreign and from an own origin")
    void publicKeyPreflight() throws Exception {
        for (String origin : new String[] {FOREIGN, OWN}) {
            HttpResponse<String> response = send("OPTIONS", PUBLIC_ROUTE, origin, "GET");

            assertThat(response.statusCode()).isEqualTo(204);
            assertThat(response.headers().allValues("Access-Control-Allow-Origin")).containsExactly("*");
            assertThat(header(response, "Access-Control-Allow-Methods")).contains("GET");
            assertThat(header(response, "Access-Control-Allow-Credentials")).isNull();
        }
    }

    @Test
    @DisplayName("The wildcard is for reading the key, not for anything else on that path")
    void publicKeyIsReadOnly() throws Exception {
        HttpResponse<String> response = send("POST", PUBLIC_ROUTE, FOREIGN, null);

        assertThat(response.statusCode()).isEqualTo(405);
        assertThat(header(response, "Access-Control-Allow-Origin")).isNull();
    }

    private HttpResponse<String> send(String method, String path, String origin, String requestMethod)
            throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + config.getHttpPort() + path))
            .method(method, BodyPublishers.noBody());
        if (origin != null) {
            request.header("Origin", origin);
        }
        if (requestMethod != null) {
            request.header("Access-Control-Request-Method", requestMethod);
        }
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static String header(HttpResponse<?> response, String name) {
        return response.headers().firstValue(name).orElse(null);
    }
}
