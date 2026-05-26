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
import static javax.ws.rs.client.ClientBuilder.newClient;
import static javax.ws.rs.client.Entity.json;
import static javax.ws.rs.core.Response.Status.FOUND;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.util.Optional;

import javax.inject.Inject;
import javax.ws.rs.core.Cookie;
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
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;

@GreenMail
@MonoMeecrowaveConfig
public class InvitationTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private GreenMailOperations greenMail;
    private Cookie marysToken;

    @BeforeEach
    void initializeTestData() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        copyDirectory(TEST_DATA_DIRECTORY, data);
        marysToken = new Cookie("token", tokenService.generateToken(new User(new Email("mary@imagey.cloud")), ONE_HOUR).token());
    }

    @Test
    @DisplayName("Invitation of new user")
    public void invitationOfNewUser() throws IOException, MessagingException {
        // Given
        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/contact-requests")
            .request()
            .cookie(marysToken)
            .post(json("""
                {
                    "email": "luise@imagey.cloud"
                }
            """));

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
        assertThat(tokenKey.trim()).isEqualToIgnoringCase("token");
        Optional<DecodedToken> decodedToken = tokenService.decode(new Token(tokenValue));
        assertThat(decodedToken).get().extracting(t -> t.jwt().getSubject()).isEqualTo("luise@imagey.cloud");
        URI location = response.getLocation();
        assertThat(location).isNotNull();
        String query = location.getQuery();
        assertThat(query.split("&")).contains("inviter=mary@imagey.cloud");
    }

    @Test
    @DisplayName("Invitation with invalid token fails")
    public void invalidInvitationTokenFails() throws IOException {
        // Given
        String invalidToken = "invalid.token.value";

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/invitations/" + invalidToken)
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(javax.ws.rs.core.Response.Status.FORBIDDEN.getStatusCode());
    }


    private String extractLink(MimeMessage message) throws IOException, MessagingException {
        String registrationMail = ((MimeMultipart)message.getContent()).getBodyPart(0).getContent().toString();
        int startIndex = registrationMail.indexOf("href=\"") + "href=\"".length();
        int endIndex = registrationMail.indexOf('"', startIndex);
        return registrationMail.substring(startIndex, endIndex)
            .replace("https://imagey.cloud", "http://localhost:" + config.getHttpPort());
    }
}
