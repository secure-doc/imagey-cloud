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
import static javax.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.Map;

import javax.inject.Inject;
import javax.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class ContactTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    @BeforeEach
    void initializeDefaultState() throws URISyntaxException, IOException {
        cleanUserData("sender@imagey.cloud");
        cleanUserData("receiver@imagey.cloud");

        new File(System.getProperty("user.dir") + "/" + rootPath, "sender@imagey.cloud").mkdirs();
        new File(System.getProperty("user.dir") + "/" + rootPath, "receiver@imagey.cloud").mkdirs();
    }

    private void cleanUserData(String email) throws IOException {
        File data = new File(System.getProperty("user.dir") + "/" + rootPath, email);
        if (data.exists()) {
            forceDelete(data);
        }
    }

    @Test
    @DisplayName("Pending Contacts endpoint returns received invitations")
    public void getPendingContacts() throws IOException {
        // Given
        User sender = new User(new Email("sender@imagey.cloud"));
        User receiver = new User(new Email("receiver@imagey.cloud"));

        Token senderToken = tokenService.generateToken(sender, Integer.MAX_VALUE);
        Token receiverToken = tokenService.generateToken(receiver, Integer.MAX_VALUE);

        // Sender sends a contact request to Receiver
        Response requestResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/sender@imagey.cloud/contact-requests")
            .request()
            .header("Cookie", "token=" + senderToken.token())
            .post(json(Map.of("email", "receiver@imagey.cloud")));

        assertThat(requestResponse.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // When Receiver queries his pending contacts
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/receiver@imagey.cloud/contact-requests")
            .request()
            .header("Cookie", "token=" + receiverToken.token())
            .get();

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        String pendingContactsJson = response.readEntity(String.class);

        // Then
        assertThat(pendingContactsJson).isEqualTo("[\"sender@imagey.cloud\"]");
    }
}
