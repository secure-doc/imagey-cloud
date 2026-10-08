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

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jwt.JWTClaimsSet;

import cloud.imagey.ForeignServer;
import cloud.imagey.UserFactory;
import cloud.imagey.domain.contact.ContactExchange;
import cloud.imagey.domain.contact.ContactRepository;
import cloud.imagey.domain.contact.ContactStatus;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.federation.FederationAssertionVerifier;
import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserMappingService;
import cloud.imagey.junit.GreenMail;

// ADR 0013 decisions 2-5: the exchange of the assertion of a foreign server (ForeignServer, whose key
// the TestFederationKeyFetcher publishes) for a guest session.
@GreenMail
@MonoMeecrowaveConfig
public class FederationSessionsResourceTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    private static final String SESSIONS = "/users/federation/sessions";
    private static final String ORIGIN = "https://foreign.test";

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private UserMappingService userMappingService;
    @Inject
    private ContactRepository contactRepository;

    private Email bob;

    @BeforeEach
    void setUp() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
        bob = new Email("bob-" + System.nanoTime() + "@gmail.com");
    }

    @Test
    @DisplayName("A valid assertion with the invitation gives a guest token that reads the moved invitation")
    void redeems() {
        invite();

        Response response = post(body(ForeignServer.assertion(bob.address()), invitation()));

        assertThat(response.getStatus()).isEqualTo(200);
        JsonObject session = Json.createReader(response.readEntity(InputStream.class)).readObject();
        assertThat(session.getInt("expiresIn")).isEqualTo(900);
        String guest = session.getString("userId");
        Response requests = newClient().target(base()).path("users/" + guest + "/contact-requests").request()
            .header("Authorization", "Bearer " + session.getString("token")).get();
        assertThat(requests.getStatus()).isEqualTo(200);
        assertThat(requests.readEntity(String.class)).contains(UserFactory.MARY_ID.id()).contains("INVITED").contains(guest);
    }

    @Test
    @DisplayName("Renewing needs no invitation and keeps the id")
    void renews() {
        invite();
        String first = userId(post(body(ForeignServer.assertion(bob.address()), invitation())));

        Response renewed = post(body(ForeignServer.assertion(bob.address()), null));

        assertThat(renewed.getStatus()).isEqualTo(200);
        assertThat(userId(renewed)).isEqualTo(first);
    }

    @Test
    @DisplayName("Whatever is wrong, the answer is the same 401: status, body and headers")
    void identicalFailures() {
        invite();
        Email carol = new Email("carol-" + System.nanoTime() + "@gmail.com");
        String replayed = ForeignServer.assertion(bob.address());
        assertThat(post(body(replayed, invitation())).getStatus()).isEqualTo(200);
        ECKey stranger = ForeignServer.generate();
        JWTClaimsSet claims = ForeignServer.defaults().subject(bob.address()).build();

        List<Response> failures = new ArrayList<>();
        failures.add(post(body(replayed, invitation())));
        failures.add(post(body(ForeignServer.sign(claims, ForeignServer.header(stranger), stranger), invitation())));
        failures.add(post(body(ForeignServer.assertion(bob.address(), "other.example"), invitation())));
        failures.add(post(body(ForeignServer.assertion(carol.address()), invitation())));
        failures.add(post(body(ForeignServer.assertion(carol.address()), null)));
        failures.add(post(body(ForeignServer.assertion(bob.address()), "garbage")));
        failures.add(post(body("garbage", null)));
        failures.add(post("{}"));
        failures.add(post(body(ForeignServer.assertion(bob.address()), "")));
        failures.add(post(body(ForeignServer.assertion(bob.address()), "x".repeat(5000))));
        failures.add(post(body(ForeignServer.assertion(c -> c.subject(bob.address()).issuer("unknown.example")), null)));

        for (Response failure : failures) {
            assertThat(failure.getStatus()).isEqualTo(401);
        }
        Set<String> bodies = new TreeSet<>();
        Set<Set<String>> headers = new HashSet<>();
        for (Response failure : failures) {
            bodies.add(failure.readEntity(String.class));
            headers.add(headerNames(failure));
        }
        assertThat(bodies).containsExactly("{}");
        assertThat(headers).hasSize(1);
    }

    @Test
    @DisplayName("A refused assertion is not used up: once the invitation exists, the same assertion gets in")
    void refusedAssertionStaysUsable() {
        String assertion = ForeignServer.assertion(bob.address());
        assertThat(post(body(assertion, null)).getStatus()).isEqualTo(401);
        invite();

        assertThat(post(body(assertion, invitation())).getStatus()).isEqualTo(200);
        assertThat(post(body(assertion, invitation())).getStatus()).isEqualTo(401);
    }

    @Test
    @DisplayName("A foreign origin may call it: the preflight is answered with POST allowed")
    void preflight() {
        Response response = newClient().target(base()).path(SESSIONS).request()
            .header("Origin", ORIGIN).header("Access-Control-Request-Method", "POST")
            .header("Access-Control-Request-Headers", "content-type").options();

        assertThat(response.getStatus()).isEqualTo(204);
        assertThat(response.getHeaderString("Access-Control-Allow-Methods")).contains("POST");
    }

    @Test
    @DisplayName("Federation off: there is nothing to exchange")
    void notFoundWhenDisabled() throws Exception {
        FederationResource resource = resource(new FederationSettings(false), 1);

        assertThatThrownBy(() -> resource.sessions(null, request("203.0.113.7"))).isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("Over the limit per client address the answer is 429 with Retry-After, for another address it is not")
    void rateLimited() throws Exception {
        FederationResource resource = resource(new FederationSettings(true), 2);

        assertThat(resource.sessions(null, request("203.0.113.7")).getStatus()).isEqualTo(401);
        assertThat(resource.sessions(null, request("203.0.113.7")).getStatus()).isEqualTo(401);
        Response limited = resource.sessions(null, request("203.0.113.7"));

        assertThat(limited.getStatus()).isEqualTo(429);
        assertThat(Long.parseLong(limited.getHeaderString("Retry-After"))).isBetween(1L, 60L);
        assertThat(resource.sessions(null, request("203.0.113.8")).getStatus()).isEqualTo(401);
    }

    private static Set<String> headerNames(Response response) {
        Set<String> names = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        names.addAll(response.getHeaders().keySet());
        names.remove("Date");
        return names;
    }

    private static FederationResource resource(FederationSettings settings, int perMinute) throws Exception {
        set(settings, "sessionsPerMinute", perMinute);
        FederationResource resource = new FederationResource();
        set(resource, "settings", settings);
        set(resource, "verifier", new FederationAssertionVerifier(settings, null, null));
        set(resource, "clock", Clock.systemUTC());
        return resource;
    }

    private static void set(Object target, String field, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }

    private static HttpServletRequest request(String remoteAddress) {
        return (HttpServletRequest) Proxy.newProxyInstance(
            FederationSessionsResourceTest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
            (proxy, method, args) -> "getRemoteAddr".equals(method.getName()) ? remoteAddress : null);
    }

    private static String userId(Response response) {
        return Json.createReader(response.readEntity(InputStream.class)).readObject().getString("userId");
    }

    // what ContactService.invite files for an address that is not registered yet
    private void invite() {
        User placeholder = new User(userMappingService.registerUser(bob));
        contactRepository.persist(new ContactExchange(
            UserFactory.mary(), placeholder, ContactStatus.INVITED, null, new DocumentId("chat-" + System.nanoTime()),
            null, null, null));
    }

    private String invitation() {
        return tokenService.generateInvitationToken(bob, TokenService.ONE_WEEK).token();
    }

    private static String body(String assertion, String invitationToken) {
        JsonObjectBuilder json = Json.createObjectBuilder(Map.of("assertion", assertion));
        if (invitationToken != null) {
            json.add("invitationToken", invitationToken);
        }
        return json.build().toString();
    }

    private Response post(String json) {
        Invocation.Builder request = newClient().target(base()).path(SESSIONS).request().header("Origin", ORIGIN);
        return request.post(Entity.json(json));
    }

    private static String base() {
        return "http://localhost:" + config.getHttpPort();
    }
}
