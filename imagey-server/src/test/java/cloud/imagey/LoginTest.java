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

import static javax.ws.rs.client.ClientBuilder.newClient;
import static javax.ws.rs.client.Entity.json;
import static javax.ws.rs.core.Response.Status.FORBIDDEN;
import static javax.ws.rs.core.Response.Status.FOUND;
import static javax.ws.rs.core.Response.Status.NOT_FOUND;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;

import javax.inject.Inject;
import javax.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.icegreen.greenmail.base.GreenMailOperations;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;

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
            .path("users/mary@imagey.cloud/verifications")
            .request()
            .post(json(""));

        MimeMessage[] receivedMessages = greenMail.getReceivedMessages();
        assertThat(receivedMessages).hasSize(1);

        // When
        String link = extractLink(receivedMessages[0]);
        Response response = newClient()
            .target(link)
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(FOUND.getStatusCode());
        String cookie = response.getHeaderString("Set-Cookie");
        String token = cookie.substring(0, cookie.indexOf(';'));
        String tokenKey = token.substring(0, token.indexOf('='));
        String tokenValue = token.substring(tokenKey.length() + 1);
        assertThat(tokenKey.trim()).isEqualToIgnoringCase("token");
        assertThat(tokenService.verify(new Token(tokenValue), new User(new Email("mary@imagey.cloud")))).isTrue();
    }

    @Test
    @DisplayName("Verification of unregistered user leads to registration mail")
    public void verifyUnregistered() throws IOException, MessagingException {
        // Given
        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/joe@imagey.cloud/verifications")
            .request()
            .post(json(""));

        MimeMessage[] receivedMessages = greenMail.getReceivedMessages();
        assertThat(receivedMessages).hasSize(1);
        String registrationLink = extractLink(receivedMessages[0]);
        String loginLink = registrationLink.replace("registrations", "authentications");

        // When
        Response response = newClient()
            .target(loginLink)
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
    }

    @Test
    @DisplayName("Login with invalid token fails")
    public void loginInvalid() throws IOException, MessagingException {
        // Given
        String invalidToken = "invalid.token.value";

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/authentications/" + invalidToken)
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(FORBIDDEN.getStatusCode());
    }

    @BeforeEach
    void initializeDefaultState() throws URISyntaxException, IOException {
        File joesData = new File("./" + rootPath, "joe@imagey.cloud");
        if (joesData.exists()) {
            forceDelete(joesData);
        }

        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDevices = new File(marysData, "devices");
        File marysCreatedDevice = new File(marysDevices, "123e4567-e89b-12d3-a456-426655440000");
        if (marysCreatedDevice.exists()) {
            forceDelete(marysCreatedDevice);
        }
    }

    private String extractLink(MimeMessage message) throws IOException, MessagingException {
        String loginMail = ((MimeMultipart)message.getContent()).getBodyPart(0).getContent().toString();
        int startIndex = loginMail.indexOf("href=\"") + "href=\"".length();
        int endIndex = loginMail.indexOf('"', startIndex);
        return loginMail.substring(startIndex, endIndex)
            .replace("https://imagey.cloud", "http://localhost:" + config.getHttpPort());
    }
}
