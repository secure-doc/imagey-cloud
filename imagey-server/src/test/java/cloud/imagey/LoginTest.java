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
package cloud.imagey;

import static cloud.imagey.domain.token.TokenService.ONE_HOUR;
import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.json;
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.FORBIDDEN;
import static jakarta.ws.rs.core.Response.Status.FOUND;
import static jakarta.ws.rs.core.Response.Status.NOT_FOUND;
import static jakarta.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.util.Optional;

import jakarta.inject.Inject;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.icegreen.greenmail.base.GreenMailOperations;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class LoginTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private GreenMailOperations greenMail;

    @Test
    public void verifyExistingLogin() throws IOException, MessagingException {
        // Given
        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/verifications")
            .request().header("Origin", "https://secure-doc.store")
            .post(json("{\"email\":\"mary@imagey.cloud\"}"));

        MimeMessage[] receivedMessages = greenMail.getReceivedMessages();
        assertThat(receivedMessages).hasSize(1);

        // When
        String link = extractLink(receivedMessages[0]);
        Response response = newClient()
            .target(link)
            .request().header("Origin", "https://secure-doc.store")
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(FOUND.getStatusCode());
        String cookie = response.getHeaderString("Set-Cookie");
        String token = cookie.substring(0, cookie.indexOf(';'));
        String tokenKey = token.substring(0, token.indexOf('='));
        String tokenValue = token.substring(tokenKey.length() + 1);
        assertThat(tokenKey.trim()).isEqualToIgnoringCase("token");
        Optional<DecodedToken> decodedToken = tokenService.decode(new Token(tokenValue));
        assertThat(decodedToken).get().extracting(t -> t.jwt().getSubject()).isEqualTo(UserFactory.MARY_ID.id());
    }

    @Test
    @DisplayName("Verification of unregistered user leads to registration mail")
    public void verifyUnregistered() throws IOException, MessagingException {
        // Given
        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/verifications")
            .request().header("Origin", "https://secure-doc.store")
            .post(json("{\"email\":\"joe@imagey.cloud\"}"));

        MimeMessage[] receivedMessages = greenMail.getReceivedMessages();
        assertThat(receivedMessages).hasSize(1);
        String registrationLink = extractLink(receivedMessages[0]);
        String loginLink = registrationLink.replace("registrations", "authentications");

        // When
        Response response = newClient()
            .target(loginLink)
            .request().header("Origin", "https://secure-doc.store")
            .get();

        // Then - a registration-typed token is rejected outright at the login endpoint.
        assertThat(response.getStatus()).isEqualTo(FORBIDDEN.getStatusCode());
    }

    @Test
    @DisplayName("Login with invalid token fails")
    public void loginInvalid() throws IOException, MessagingException {
        // Given
        String invalidToken = "invalid.token.value";

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/authentications/" + invalidToken)
            .request().header("Origin", "https://secure-doc.store")
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(FORBIDDEN.getStatusCode());
    }

    @Test
    @DisplayName("Verification of an invited-but-not-registered user leads to registration mail, not login")
    public void verifyInvitedButUnregistered() throws IOException, MessagingException {
        // A pending invite creates the invitee's home directory (ContactRepository.persist) before
        // they ever register - that bare directory must not make them look like an existing account.
        File inviteeHome = new File(rootPath, "invitee-home-placeholder");
        new File(inviteeHome, "contact-requests").mkdirs();

        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/verifications")
            .request().header("Origin", "https://secure-doc.store")
            .post(json("{\"email\":\"invitee@imagey.cloud\"}"));

        MimeMessage[] receivedMessages = greenMail.getReceivedMessages();
        assertThat(receivedMessages).hasSize(1);
        assertThat(extractLink(receivedMessages[0])).contains("/registrations/");
    }

    @Test
    @DisplayName("A login link for an address with no user mapping is answered with 404")
    public void loginForUnmappedAddress() {
        Token loginToken = tokenService.generateLoginToken(new Email("ghost@imagey.cloud"), ONE_HOUR);

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/authentications/" + loginToken.token())
            .request().header("Origin", "https://secure-doc.store")
            .get();

        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
    }

    @Test
    @DisplayName("A login link for a mapped address whose account no longer exists is answered with 404")
    public void loginForMappedButMissingAccount() {
        // joe is in the user-ids.json fixture, but initializeDefaultState() removes his data directory.
        Token loginToken = tokenService.generateLoginToken(new Email("joe@imagey.cloud"), ONE_HOUR);

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/authentications/" + loginToken.token())
            .request().header("Origin", "https://secure-doc.store")
            .get();

        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
    }

    @Test
    @DisplayName("A verification request from a disallowed client URL is rejected with 400")
    public void verificationFromDisallowedOrigin() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/verifications")
            .request().header("Origin", "https://evil.example.com")
            .post(json("{\"email\":\"mary@imagey.cloud\"}"));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    @Test
    @DisplayName("A user-mapping file that holds a bare null is treated as an empty mapping")
    public void nullUserMappingFileIsTolerated() throws IOException {
        Files.writeString(new File(rootPath, "user-ids.json").toPath(), "null");

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/verifications")
            .request().header("Origin", "https://secure-doc.store")
            .post(json("{\"email\":\"mary@imagey.cloud\"}"));

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @BeforeEach
    void initializeDefaultState() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        copyDirectory(new File("src/test/resources/data"), data);
        // Joe must look unregistered - verification of his address should start registration.
        deleteQuietly(new File(data, UserFactory.JOE_ID.id()));
        deleteQuietly(new File(data, "invitee-home-placeholder"));
    }

    private String extractLink(MimeMessage message) throws IOException, MessagingException {
        String loginMail = ((MimeMultipart)message.getContent()).getBodyPart(0).getContent().toString();
        int startIndex = loginMail.indexOf("href=\"") + "href=\"".length();
        int endIndex = loginMail.indexOf('"', startIndex);
        return loginMail.substring(startIndex, endIndex)
            .replace("https://secure-doc.store", "http://localhost:" + config.getHttpPort());
    }
}
