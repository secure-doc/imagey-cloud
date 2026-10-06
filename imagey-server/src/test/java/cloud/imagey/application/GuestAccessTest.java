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
import static jakarta.ws.rs.client.Entity.text;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static jakarta.ws.rs.core.Response.Status.FORBIDDEN;
import static jakarta.ws.rs.core.Response.Status.OK;
import static jakarta.ws.rs.core.Response.Status.UNAUTHORIZED;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;

import jakarta.inject.Inject;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.UserFactory;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.DomainName;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

// ADR 0013 A4: a guest session is a bearer token with the guest claim. Laura plays the guest here;
// in a real federation she would be a user of another server (F4 issues such tokens).
@GreenMail
@MonoMeecrowaveConfig
public class GuestAccessTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    private static final DomainName HOME = new DomainName("https://secure-doc.store");

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    private final User mary = UserFactory.mary();
    private final User laura = UserFactory.laura();

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @Test
    @DisplayName("A guest who is member of a chat reads and posts its messages")
    void guestReadsAndPostsMessages() {
        String chat = "users/" + mary.id().id() + "/documents/chat-laura/messages";

        assertThat(request(chat).header("Authorization", bearer(guestToken(laura))).get().getStatus())
            .isEqualTo(OK.getStatusCode());

        Response posted = request(chat).header("Authorization", bearer(guestToken(laura))).post(text("hello"));
        assertThat(posted.getStatus()).isEqualTo(CREATED.getStatusCode());
        // The sender is the guest's own id.
        assertThat(request(chat).header("Authorization", bearer(guestToken(laura))).get().readEntity(String.class))
            .contains(laura.id().id());
    }

    @Test
    @DisplayName("A guest may read and answer its contact requests")
    void guestHandlesContactRequests() {
        String requests = "users/" + laura.id().id() + "/contact-requests";
        String bearer = bearer(guestToken(laura));

        assertThat(request(requests).header("Authorization", bearer).get().getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(request(requests + "/" + mary.id().id()).header("Authorization", bearer)
            .delete().getStatus()).isNotIn(UNAUTHORIZED.getStatusCode(), FORBIDDEN.getStatusCode());
        assertThat(request(requests + "/" + mary.id().id()).header("Authorization", bearer)
            .put(Entity.json("{}")).getStatus()).isNotIn(UNAUTHORIZED.getStatusCode(), FORBIDDEN.getStatusCode());
    }

    @Test
    @DisplayName("A guest is forbidden everything else on its own path")
    void guestIsNotOwnerOfAnythingElse() {
        String own = "users/" + laura.id().id();
        String bearer = bearer(guestToken(laura));

        assertThat(request(own + "/contact-requests").header("Authorization", bearer).post(Entity.json("{}")).getStatus())
            .isEqualTo(FORBIDDEN.getStatusCode());
        Entity<String> content = Entity.entity("x", MediaType.APPLICATION_OCTET_STREAM);
        assertThat(request(own + "/documents/x").header("Authorization", bearer).put(content).getStatus())
            .isEqualTo(FORBIDDEN.getStatusCode());
        assertThat(request(own + "/devices/d/public-keys").header("Authorization", bearer).post(Entity.json("{}")).getStatus())
            .isEqualTo(FORBIDDEN.getStatusCode());
        assertThat(request(own + "/devices").header("Authorization", bearer).get().getStatus())
            .isEqualTo(FORBIDDEN.getStatusCode());
    }

    @Test
    @DisplayName("A guest without a key in the chat is forbidden, not unauthenticated")
    void guestWithoutMembershipIsForbidden() {
        String document = "users/" + mary.id().id() + "/documents/" + new DocumentId("no-member").id();

        assertThat(request(document).header("Authorization", bearer(guestToken(laura))).get().getStatus())
            .isEqualTo(FORBIDDEN.getStatusCode());
    }

    @Test
    @DisplayName("A guest token is no authentication as a cookie")
    void guestTokenAsCookieIsAnonymous() {
        Cookie cookie = new Cookie.Builder("token").value(guestToken(laura).token()).build();

        assertThat(request("users/" + laura.id().id() + "/contact-requests").cookie(cookie).get().getStatus())
            .isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("A local session token is no authentication as a bearer")
    void localTokenAsBearerIsAnonymous() {
        Token local = tokenService.generateAuthenticationToken(laura, TokenService.ONE_HOUR);

        assertThat(request("users/" + laura.id().id() + "/contact-requests").header("Authorization", bearer(local))
            .get().getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("An invalid bearer token is rejected, and a valid cookie does not help")
    void invalidBearerIgnoresTheCookie() {
        Cookie cookie = new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(laura, TokenService.ONE_HOUR).token())
            .build();

        assertThat(request("users/" + laura.id().id() + "/contact-requests")
            .header("Authorization", "Bearer invalid").cookie(cookie).get().getStatus())
            .isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("An expired guest token is rejected")
    void expiredGuestTokenIsRejected() {
        Token expired = guestToken(laura, -1000);

        assertThat(request("users/" + laura.id().id() + "/contact-requests").header("Authorization", bearer(expired))
            .get().getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("A guest token never extends itself into a cookie")
    void guestTokenNeverSetsACookie() {
        Response response = request("users/" + laura.id().id() + "/contact-requests")
            .header("Authorization", bearer(guestToken(laura))).get();

        assertThat(response.getHeaderString("Set-Cookie")).isNull();
    }

    private Token guestToken(User user) {
        return tokenService.generateGuestToken(user, HOME);
    }

    private Token guestToken(User user, long validity) {
        return tokenService.generateGuestToken(user, HOME, validity);
    }

    private static String bearer(Token token) {
        return "Bearer " + token.token();
    }

    private Invocation.Builder request(String path) {
        return newClient().target("http://localhost:" + config.getHttpPort()).path(path).request();
    }
}
