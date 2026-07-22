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

import static cloud.imagey.domain.token.TokenService.ONE_HOUR;
import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.json;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static jakarta.ws.rs.core.Response.Status.NO_CONTENT;
import static java.util.Map.of;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.List;

import jakarta.inject.Inject;
import jakarta.mail.internet.MimeMessage;
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

import com.icegreen.greenmail.base.GreenMailOperations;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class ContactResourceTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private GreenMailOperations greenMail;

    private User sender;
    private User recipient;
    private Cookie senderCookie;
    private Cookie recipientCookie;

    @BeforeEach
    void initializeState() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        sender = new User(new Email("sender@example.com"));
        senderCookie = new Cookie.Builder("token").value(tokenService.generateToken(sender, ONE_HOUR).token()).build();

        recipient = new User(new Email("recipient@example.com"));
        recipientCookie = new Cookie.Builder("token").value(tokenService.generateToken(recipient, ONE_HOUR).token()).build();

        new File(rootPath, sender.email().address()).mkdirs();
        new File(rootPath, recipient.email().address()).mkdirs();
    }

    private Builder client(User user, String... paths) {
        Cookie cookie = user.equals(sender) ? senderCookie : recipientCookie;
        WebTarget target = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(user.email().address());
        for (String path : paths) {
            target = target.path(path);
        }
        return target.request()
            .header("Origin", "https://secure-doc.store")
            .cookie(cookie);
    }

    @Test
    @DisplayName("Requesting contact for external unregistered user sends email and returns 201")
    void requestContactExternalUser() throws Exception {
        Response response = client(sender, "contact-requests")
            .post(json(of("recipient", "external@example.com", "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
        assertThat(response.getLocation().toString()).endsWith("/users/sender@example.com/contact-requests/external@example.com");

        MimeMessage[] receivedMessages = greenMail.getReceivedMessages();
        assertThat(receivedMessages).hasSize(1);
        assertThat(receivedMessages[0].getAllRecipients()[0].toString()).isEqualTo("external@example.com");
    }

    @Test
    @DisplayName("Requesting contact for existing user creates invitation")
    void requestContactExistingUser() {
        Response response = client(sender, "contact-requests")
            .post(json(of("recipient", recipient.email().address(), "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<cloud.imagey.domain.contact.ContactExchange> requests = client(recipient, "contact-requests")
            .get(new GenericType<List<cloud.imagey.domain.contact.ContactExchange>>() { });
        assertThat(requests).extracting(r -> r.inviter()).containsExactly(sender);
    }

    @Test
    @DisplayName("Mutual contact request returns 204")
    void mutualContactRequest() {
        client(sender, "contact-requests").post(json(of("recipient", recipient.email().address(),
            "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        Response response = client(recipient, "contact-requests")
            .post(json(of("recipient", sender.email().address(), "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        assertThat(response.getStatus()).isEqualTo(NO_CONTENT.getStatusCode());

        List<cloud.imagey.domain.contact.ContactExchange> recipientRequests = client(recipient, "contact-requests")
            .get(new GenericType<List<cloud.imagey.domain.contact.ContactExchange>>() { });
        assertThat(recipientRequests).extracting(r -> r.inviter()).containsExactly(sender);
    }

    @Test
    @DisplayName("Get contact requests returns pending requests")
    void getContactRequests() {
        List<cloud.imagey.domain.contact.ContactExchange> requestsBefore = client(recipient, "contact-requests")
            .get(new GenericType<List<cloud.imagey.domain.contact.ContactExchange>>() { });
        assertThat(requestsBefore).isEmpty();

        client(sender, "contact-requests").post(json(of("recipient", recipient.email().address(),
            "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        List<cloud.imagey.domain.contact.ContactExchange> requestsAfter = client(recipient, "contact-requests")
            .get(new GenericType<List<cloud.imagey.domain.contact.ContactExchange>>() { });
        assertThat(requestsAfter).extracting(r -> r.inviter()).containsExactly(sender);
    }

    @Test
    @DisplayName("Decline invitation removes contact request")
    void declineInvitation() {
        client(sender, "contact-requests").post(json(of("recipient", recipient.email().address(),
            "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        Response response = client(recipient, "contact-requests", sender.email().address())
            .delete();

        assertThat(response.getStatus()).isEqualTo(NO_CONTENT.getStatusCode());

        List<cloud.imagey.domain.contact.ContactExchange> requestsAfter = client(recipient, "contact-requests")
            .get(new GenericType<List<cloud.imagey.domain.contact.ContactExchange>>() { });
        assertThat(requestsAfter).isEmpty();
    }

    @Test
    @DisplayName("Accept invitation successfully")
    void acceptInvitation() {
        // Sender sends request
        client(sender, "contact-requests").post(json(of("recipient", recipient.email().address(),
            "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));

        // Recipient accepts
        Response response = client(recipient, "contacts", sender.email().address())
            .put(json(of("documentId", "chat-doc-123", "key", "encrypted-sym-key")));

        assertThat(response.getStatus()).isEqualTo(NO_CONTENT.getStatusCode());
    }

    @Test
    @DisplayName("Accept non-existent invitation throws Conflict")
    void acceptNonExistentInvitation() {
        // Recipient tries to accept without an invitation existing
        Response response = client(recipient, "contacts", sender.email().address())
            .put(json(of("documentId", "chat-doc-123", "key", "encrypted-sym-key")));

        assertThat(response.getStatus()).isEqualTo(409);
    }

    @Test
    @DisplayName("Decline invitation without prior request and subsequent invite throws Conflict")
    void declineInvitationWithoutRequest() {
        // Recipient preemptively declines or declines non-existent request from sender
        Response declineResponse = client(recipient, "contact-requests", sender.email().address()).delete();
        assertThat(declineResponse.getStatus()).isEqualTo(NO_CONTENT.getStatusCode());

        // Sender tries to invite recipient who already denied
        Response inviteResponse = client(sender, "contact-requests").post(json(of("recipient", recipient.email().address(),
            "key", of("kty", "RSA", "n", "AQAB", "e", "AQAB"))));
        assertThat(inviteResponse.getStatus()).isEqualTo(409);
    }
}
