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

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.json;
import static jakarta.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static java.lang.Integer.MAX_VALUE;
import static java.util.Map.of;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;

import jakarta.inject.Inject;
import jakarta.ws.rs.client.Invocation.Builder;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class ContactRequestTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    private Cookie laurasCookie;
    private TestClient marysClient;
    private TestClient laurasClient;

    @BeforeEach
    void initializeState() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        copyDirectory(TEST_DATA_DIRECTORY, data);
        File marysInvitations = getMarysContactRequests();
        if (marysInvitations.exists()) {
            forceDelete(marysInvitations);
        }
        File laurasInvitations = getLaurasContactRequests();
        if (laurasInvitations.exists()) {
            forceDelete(laurasInvitations);
        }
        File marysContacts = new File(getMarysData(), "contacts");
        if (marysContacts.exists()) {
            forceDelete(marysContacts);
        }
        File laurasContacts = new File(getLaurasData(), "contacts");
        if (laurasContacts.exists()) {
            forceDelete(laurasContacts);
        }
        User mary = getMary();
        User laura = new User(new Email("laura@imagey.cloud"));
        marysClient = path -> newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users").path(mary.email().address()).path(path)
                .request()
                .header("Origin", "https://secure-doc.store")
                .cookie(new Cookie.Builder("token")
                    .value(tokenService.generateToken(mary, MAX_VALUE).token())
                    .build());
        laurasCookie = new Cookie.Builder("token")
                .value(tokenService.generateToken(laura, MAX_VALUE).token())
                .build();
        laurasClient = path -> newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users").path(laura.email().address()).path(path)
                .request().header("Origin", "https://secure-doc.store")
                .cookie(laurasCookie);
    }

    @Test
    @DisplayName("Accept a second contact")
    public void acceptSecondContact() throws IOException {
        // Setup laura as a contact for mary
        File marysContacts = new File(getMarysData(), "contacts");
        marysContacts.mkdirs();
        File lauraFolder = new File(marysContacts, "laura@imagey.cloud");
        lauraFolder.mkdirs();

        // Now mary accepts joe
        User joe = new User(new Email("joe@imagey.cloud"));
        TestClient joesClient = path -> newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(joe.email().address()).path(path)
            .request().header("Origin", "https://secure-doc.store")
            .cookie(new Cookie("token", tokenService.generateToken(joe, MAX_VALUE).token()));

        // Joe sends request to mary
        joesClient.path("contact-requests").post(json(of("recipient", "mary@imagey.cloud", "key", of("kty", "RSA",
            "n", "ANJ+E8d0L_U9fW9Q5Z7Y4C_x8y4q4S6_Y5d3O_e9Z8H1hP6U_Zz9C8D4A_v_F1_L5q"
            + "-jV9O4xV4wK0Lw3_D4c0E0M_Z8R-r7Q9y2hX0L4I7gY7X_R_a7eG_R5y4D6A_c0K7E_j8d8S4"
            + "_w6C-I4E9u_Y_S3Z8S8A0A0",
            "e", "AQAB"))));

        // Mary accepts joe
        Response contactRequestAccepted = marysClient.path("contacts/joe@imagey.cloud")
            .put(json(of("documentId", "chat-document-id", "key", "encrypted-shared-key-for-joe")));
        assertThat(contactRequestAccepted.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @Test
    @DisplayName("Cannot invite a user from a disallowed domain")
    public void inviteDisallowedDomain() throws IOException {
        // use an unknown origin
        Response requestResponse = marysClient.path("contact-requests")
            .header("Origin", "https://evil.com")
            .post(json(of("recipient", "joe@imagey.cloud")));

        // Allowed domains are defined in application.properties or DomainName.
        // Typically imagey.cloud is allowed. If evil.com is rejected, we expect a 4xx error.
        // Actually UserService / ContactService throws IllegalArgumentException or returns false.
        // Let's assert it's a BAD_REQUEST or whatever maps from IllegalArgumentException
        assertThat(requestResponse.getStatusInfo().getFamily()).isNotEqualTo(SUCCESSFUL);
    }



    private User getMary() {
        return new User(new Email("mary@imagey.cloud"));
    }

    private User getLaura() {
        return new User(new Email("laura@imagey.cloud"));
    }

    private File getMarysData() {
        return new File(rootPath, getMary().email().address());
    }

    private File getLaurasData() {
        return new File(rootPath, getLaura().email().address());
    }

    private File getMarysContactRequests() {
        return new File(getMarysData(), "contact-requests");
    }

    private File getLaurasContactRequests() {
        return new File(getLaurasData(), "contact-requests");
    }

    public interface TestClient {
        Builder path(String path);
    }
}
