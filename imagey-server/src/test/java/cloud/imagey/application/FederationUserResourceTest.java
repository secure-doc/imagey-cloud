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

import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import cloud.imagey.UserFactory;
import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.domain.federation.FederationSigningKey;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.DomainName;
import cloud.imagey.junit.GreenMail;

// F5 (the assertion of the home server) and A6 (foreign principals): both belong to a logged-in local user.
@GreenMail
@MonoMeecrowaveConfig
public class FederationUserResourceTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    private static final String OWN = "https://imagey.cloud";

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private FederationSigningKey signingKey;

    @BeforeEach
    void setUp() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @Test
    @DisplayName("Mary gets an assertion for her own address that the foreign server can verify with our public key")
    void mintsAnAssertion() throws Exception {
        Response response = assertion(maryCookie(), OWN, "foreign.test", UserFactory.MARY_EMAIL.address());

        assertThat(response.getStatus()).isEqualTo(200);
        String assertion = Json.createReader(response.readEntity(InputStream.class)).readObject().getString("assertion");
        SignedJWT jwt = SignedJWT.parse(assertion);
        assertThat(jwt.verify(new ECDSAVerifier(signingKey.publicKey()))).isTrue();
        JWTClaimsSet claims = jwt.getJWTClaimsSet();
        assertThat(claims.getIssuer()).isEqualTo("imagey.cloud");
        assertThat(claims.getSubject()).isEqualTo(UserFactory.MARY_EMAIL.address());
        assertThat(claims.getAudience()).containsExactly("foreign.test");
    }

    @Test
    @DisplayName("Everything that is not hers is a 403: another address, an own or invalid audience, a foreign origin")
    void refusals() {
        Cookie mary = maryCookie();

        assertThat(assertion(mary, OWN, "foreign.test", UserFactory.JOE_EMAIL.address()).getStatus()).isEqualTo(403);
        assertThat(assertion(mary, OWN, "foreign.test", "nobody@imagey.cloud").getStatus()).isEqualTo(403);
        assertThat(assertion(mary, OWN, "foreign.test", "no-address").getStatus()).isEqualTo(403);
        assertThat(assertion(mary, OWN, "imagey.cloud", UserFactory.MARY_EMAIL.address()).getStatus()).isEqualTo(403);
        assertThat(assertion(mary, OWN, "a/b.example", UserFactory.MARY_EMAIL.address()).getStatus()).isEqualTo(403);
        assertThat(assertion(mary, OWN, "10.0.0.1", UserFactory.MARY_EMAIL.address()).getStatus()).isEqualTo(403);
        assertThat(assertion(mary, "https://evil.example", "foreign.test", UserFactory.MARY_EMAIL.address()).getStatus())
            .isEqualTo(403);
    }

    @Test
    @DisplayName("No session is a 401, and a guest is never asked: 403")
    void authentication() {
        Response anonymous = newClient().target(base()).path(path("federation-assertions")).request()
            .header("Origin", OWN).post(Entity.json(body("foreign.test", UserFactory.MARY_EMAIL.address())));
        Response guest = newClient().target(base()).path(path("federation-assertions")).request().header("Origin", OWN)
            .header("Authorization", guestBearer())
            .post(Entity.json(body("other.example", UserFactory.MARY_EMAIL.address())));

        assertThat(anonymous.getStatus()).isEqualTo(401);
        assertThat(guest.getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("Federation off: no assertion and no principal")
    void notFoundWhenDisabled() throws Exception {
        FederationUserResource resource = new FederationUserResource();
        Field settings = FederationUserResource.class.getDeclaredField("settings");
        settings.setAccessible(true);
        settings.set(resource, new FederationSettings(false));

        assertThatThrownBy(() -> resource.assertion(UserFactory.mary(), null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> resource.foreignPrincipal(UserFactory.mary(), null)).isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("A foreign principal gets a local id, always the same")
    void foreignPrincipal() {
        Response first = principal(maryCookie(), "foreign.test", "alice@example.com");
        Response second = principal(maryCookie(), "FOREIGN.test", "Alice@Example.com");
        Response other = principal(maryCookie(), "other.example", "alice@example.com");

        assertThat(first.getStatus()).isEqualTo(200);
        String id = userId(first);
        assertThat(userId(second)).isEqualTo(id);
        assertThat(userId(other)).isNotEqualTo(id);
    }

    @Test
    @DisplayName("A foreign principal needs a foreign domain and an address, and a guest cannot create one")
    void foreignPrincipalRefusals() {
        assertThat(principal(maryCookie(), "imagey.cloud", "alice@example.com").getStatus()).isEqualTo(400);
        assertThat(principal(maryCookie(), "a/b", "alice@example.com").getStatus()).isEqualTo(400);
        assertThat(principal(maryCookie(), "foreign.test", "alice").getStatus()).isEqualTo(400);
        Response guest = newClient().target(base()).path(path("foreign-principals")).request().header("Origin", OWN)
            .header("Authorization", guestBearer())
            .post(Entity.json("{\"domain\":\"foreign.test\",\"address\":\"alice@example.com\"}"));
        assertThat(guest.getStatus()).isEqualTo(403);
    }

    private String guestBearer() {
        return "Bearer " + tokenService.generateGuestToken(UserFactory.mary(), new DomainName("foreign.test")).token();
    }

    private Cookie maryCookie() {
        return new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(UserFactory.mary(), TokenService.ONE_HOUR).token()).build();
    }

    private Response assertion(Cookie cookie, String origin, String aud, String email) {
        return newClient().target(base()).path(path("federation-assertions")).request()
            .header("Origin", origin).cookie(cookie).post(Entity.json(body(aud, email)));
    }

    private Response principal(Cookie cookie, String domain, String address) {
        return newClient().target(base()).path(path("foreign-principals")).request().header("Origin", OWN).cookie(cookie)
            .post(Entity.json("{\"domain\":\"" + domain + "\",\"address\":\"" + address + "\"}"));
    }

    private static String userId(Response response) {
        return Json.createReader(response.readEntity(InputStream.class)).readObject().getString("userId");
    }

    private static String path(String resource) {
        return "users/" + UserFactory.MARY_ID.id() + "/" + resource;
    }

    private static String body(String aud, String email) {
        return "{\"aud\":\"" + aud + "\",\"email\":\"" + email + "\"}";
    }

    private static String base() {
        return "http://localhost:" + config.getHttpPort();
    }
}
