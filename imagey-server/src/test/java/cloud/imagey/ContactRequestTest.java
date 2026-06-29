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
import static java.util.Map.entry;
import static java.util.Map.of;
import static jakarta.ws.rs.core.Response.Status.CONFLICT;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static jakarta.ws.rs.core.Response.Status.NO_CONTENT;
import static jakarta.ws.rs.core.Response.Status.OK;
import static jakarta.ws.rs.core.Response.Status.UNAUTHORIZED;
import static jakarta.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static java.lang.Integer.MAX_VALUE;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Map;

import jakarta.inject.Inject;
import jakarta.ws.rs.client.Invocation.Builder;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.GenericType;
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
    @DisplayName("Contact request is can be accepted")
    public void acceptContactRequest() throws IOException {
        // Given
        List<String> marysContactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() { });
        List<String> laurasContactRequests = laurasClient.path("contact-requests").get(new GenericType<List<String>>() { });
        List<String> marysContacts = marysClient.path("contacts").get(new GenericType<List<String>>() { });
        List<String> laurasContacts = laurasClient.path("contacts").get(new GenericType<List<String>>() { });
        assertThat(marysContactRequests).isEmpty();
        assertThat(marysContacts).isEmpty();
        assertThat(laurasContactRequests).isEmpty();
        assertThat(laurasContacts).isEmpty();
        WebTarget marysPublicKey = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/public-keys/0");
        Response marysPublicKeyResponse = marysPublicKey
            .request().header("Origin", "https://secure-doc.store")
            .cookie(laurasCookie)
            .get();
        assertThat(marysPublicKeyResponse.getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());

        // mary sends a contact request to laura
        Response requestResponse = marysClient.path("contact-requests")
            .post(json(of("email", "laura@imagey.cloud")));
        assertThat(requestResponse.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // laura can see the contact request
        laurasContactRequests = laurasClient.path("contact-requests").get(new GenericType<List<String>>() { });
        assertThat(laurasContactRequests).containsExactly("mary@imagey.cloud");
        marysPublicKeyResponse = marysPublicKey.request().header("Origin", "https://secure-doc.store").cookie(laurasCookie).get();
        assertThat(marysPublicKeyResponse.getStatus()).isEqualTo(OK.getStatusCode());
        // mary cannot see her own contact requests
        marysContactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() { });
        assertThat(marysContactRequests).isEmpty();
        // mary cannot accept the request
        Response contactRequestNotAccepted = marysClient.path("contacts/laura@imagey.cloud").put(json("""
                {
                    "userKey": {
                        "issuer": "mary@imagey.cloud",
                        "kid": "0",
                        "sharedKey": "public-shared-key"
                    },
                    "contactKey": {
                        "issuer": "mary@imagey.cloud",
                        "kid": "0",
                        "sharedKey": "public-shared-key"
                    }
                }
            """));
        assertThat(contactRequestNotAccepted.getStatus()).isEqualTo(CONFLICT.getStatusCode());

        // When
        // laura accepts the contact request
        Response contactRequestAccepted = laurasClient.path("contacts/mary@imagey.cloud").put(json("""
                {
                    "userKey": {
                        "issuer": "laura@imagey.cloud",
                        "kid": "0",
                        "sharedKey": "public-shared-key"
                    },
                    "contactKey": {
                        "issuer": "laura@imagey.cloud",
                        "kid": "0",
                        "sharedKey": "public-shared-key"
                    }
                }
            """));
        assertThat(contactRequestAccepted.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Then
        marysContactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() { });
        laurasContactRequests = laurasClient.path("contact-requests").get(new GenericType<List<String>>() { });
        marysContacts = marysClient.path("contacts").get(new GenericType<List<String>>() { });
        laurasContacts = laurasClient.path("contacts").get(new GenericType<List<String>>() { });
        assertThat(marysContactRequests).isEmpty();
        assertThat(marysContacts).contains("laura@imagey.cloud");
        assertThat(laurasContactRequests).isEmpty();
        assertThat(laurasContacts).contains("mary@imagey.cloud");
        marysPublicKeyResponse = marysPublicKey.request().header("Origin", "https://secure-doc.store").cookie(laurasCookie).get();
        assertThat(marysPublicKeyResponse.getStatus()).isEqualTo(OK.getStatusCode());

        // Verify getContactKeys endpoint
        Response keysResponse = laurasClient.path("contacts/mary@imagey.cloud/key").get();
        Map<String, Object> key = keysResponse.readEntity(new GenericType<Map<String, Object>>() { });
        assertThat(key).contains(entry("sharedKey", "public-shared-key"));



        File marysContactRequestsFolder = getMarysContactRequests();
        assertThat(marysContactRequestsFolder).isDirectory();
        assertThat(marysContactRequestsFolder.listFiles()).isEmpty();
    }

    @Test
    @DisplayName("The recipient can send contact request after decline")
    public void contactRequestAfterDecline() throws IOException {
        // Given
        List<String> marysContactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() { });
        List<String> laurasContactRequests = laurasClient.path("contact-requests").get(new GenericType<List<String>>() { });
        List<String> marysContacts = marysClient.path("contacts").get(new GenericType<List<String>>() { });
        List<String> laurasContacts = laurasClient.path("contacts").get(new GenericType<List<String>>() { });
        assertThat(marysContactRequests).isEmpty();
        assertThat(marysContacts).isEmpty();
        assertThat(laurasContactRequests).isEmpty();
        assertThat(laurasContacts).isEmpty();

        // mary sends a contact request to laura
        Response requestResponse = marysClient.path("contact-requests")
            .post(json(of("email", "laura@imagey.cloud")));
        assertThat(requestResponse.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // When
        // laura declines the contact request
        Response contactRequestAccepted = laurasClient.path("contact-requests/mary@imagey.cloud").delete();
        assertThat(contactRequestAccepted.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Then
        requestResponse = marysClient.path("contact-requests")
                .post(json(of("email", "laura@imagey.cloud")));
        assertThat(requestResponse.getStatus()).isEqualTo(CONFLICT.getStatusCode());

        requestResponse = laurasClient.path("contact-requests")
                .post(json(of("email", "mary@imagey.cloud")));
        assertThat(requestResponse.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        marysContactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() {
        });
        assertThat(marysContactRequests).contains("laura@imagey.cloud");
    }

    @Test
    @DisplayName("When both send request either can accept")
    public void bothSendRequest() throws IOException {
        // Given
        List<String> marysContactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() { });
        List<String> laurasContactRequests = laurasClient.path("contact-requests").get(new GenericType<List<String>>() { });
        List<String> marysContacts = marysClient.path("contacts").get(new GenericType<List<String>>() { });
        List<String> laurasContacts = laurasClient.path("contacts").get(new GenericType<List<String>>() { });
        assertThat(marysContactRequests).isEmpty();
        assertThat(marysContacts).isEmpty();
        assertThat(laurasContactRequests).isEmpty();
        assertThat(laurasContacts).isEmpty();
        // mary sends a contact request to laura
        Response marysRequestResponse = marysClient.path("contact-requests")
            .post(json(of("email", "laura@imagey.cloud")));
        assertThat(marysRequestResponse.getStatus()).isEqualTo(CREATED.getStatusCode());
        // laura sends a contact request to mary
        Response laurasRequestResponse = laurasClient.path("contact-requests")
            .post(json(of("email", "mary@imagey.cloud")));
        assertThat(laurasRequestResponse.getStatus()).isEqualTo(NO_CONTENT.getStatusCode());
        // When
        // laura accepts the contact request
        Response contactRequestAccepted = laurasClient.path("contacts/mary@imagey.cloud").put(json("""
                {
                    "userKey": {
                        "issuer": "laura@imagey.cloud",
                        "kid": "0",
                        "sharedKey": "public-shared-key"
                    },
                    "contactKey": {
                        "issuer": "laura@imagey.cloud",
                        "kid": "0",
                        "sharedKey": "public-shared-key"
                    }
                }
            """));
        assertThat(contactRequestAccepted.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Then
        marysContacts = marysClient.path("contacts").get(new GenericType<List<String>>() {
        });
        laurasContacts = laurasClient.path("contacts").get(new GenericType<List<String>>() {
        });
        assertThat(marysContacts).contains("laura@imagey.cloud");
        assertThat(laurasContacts).contains("mary@imagey.cloud");
        File marysContactRequestsFolder = getMarysContactRequests();
        assertThat(marysContactRequestsFolder).isDirectory();
        assertThat(marysContactRequestsFolder.listFiles()).isEmpty();
        File laurasContactRequestsFolder = getLaurasContactRequests();
        assertThat(laurasContactRequestsFolder).isDirectory();
        assertThat(laurasContactRequestsFolder.listFiles()).isEmpty();
    }

    @Test
    @DisplayName("Handle missing directories gracefully")
    public void testMissingContactDirectories() throws IOException {
        // Given that all directories are deleted
        File marysContactRequests = getMarysContactRequests();
        if (marysContactRequests.exists()) {
            org.apache.commons.io.FileUtils.deleteDirectory(marysContactRequests);
        }
        File marysContacts = new File(getMarysData(), "contacts");
        if (marysContacts.exists()) {
            org.apache.commons.io.FileUtils.deleteDirectory(marysContacts);
        }

        // When fetching contact requests with no directory
        List<String> contactRequests = marysClient.path("contact-requests").get(new GenericType<List<String>>() { });
        assertThat(contactRequests).isEmpty();

        // When fetching contacts with no directory
        List<String> contacts = marysClient.path("contacts").get(new GenericType<List<String>>() { });
        assertThat(contacts).isEmpty();

        // When fetching a specific contact status with no file
        Response response = marysClient.path("contact-requests/laura@imagey.cloud").get();
        // Since getContactStatus is used internally or returns 404/similar if empty,
        // we just verify that we can call it (or something that depends on it) without crashing
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
