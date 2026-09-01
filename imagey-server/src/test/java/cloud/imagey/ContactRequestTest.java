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
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.CONFLICT;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static jakarta.ws.rs.core.Response.Status.NO_CONTENT;
import static jakarta.ws.rs.core.Response.Status.OK;
import static jakarta.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static java.lang.Integer.MAX_VALUE;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.apache.commons.io.FileUtils.writeStringToFile;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;

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

import cloud.imagey.domain.contact.ContactExchange;
import cloud.imagey.domain.contact.ContactRepository;
import cloud.imagey.domain.contact.ContactStatus;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

// Full-stack integration test for the whole contact-request lifecycle over HTTP: the
// invite -> accept -> confirm-receipt handshake plus every off-happy-path branch the Pact
// contract does not exercise (disallowed origin, decline of an existing vs. a never-received
// invitation, re-invite/accept after a decline, confirm-receipt out of order). Also drives
// GET contact-requests through ContactRepository.isActionableFor at each handshake step.
@GreenMail
@MonoMeecrowaveConfig
public class ContactRequestTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    private static final String ORIGIN = "https://secure-doc.store";
    private static final String PUBLIC_KEY
        = "{\"crv\": \"P-256\", \"ext\": true, \"key_ops\": [], \"kty\": \"EC\","
        + " \"x\": \"O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4\","
        + " \"y\": \"ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU\"}";

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private ContactRepository contactRepository;

    private final User mary = UserFactory.mary();
    private final User laura = UserFactory.laura();

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
        deleteQuietly(new File(data, mary.id().id() + "/contact-requests"));
        deleteQuietly(new File(data, laura.id().id() + "/contact-requests"));
    }

    @Test
    @DisplayName("Inviting an existing user creates a pending contact request")
    public void inviteExistingUser() {
        Response response = contactRequests(mary, mary, "https://secure-doc.store").post(json(invitation(emailOf(laura))));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
        assertThat(contactRepository.getContactExchange(mary, laura))
            .get().extracting(ContactExchange::status).isEqualTo(ContactStatus.INVITED);
    }

    @Test
    @DisplayName("Re-inviting an already invited user is a no-op")
    public void inviteAlreadyInvitedUser() {
        contactRequests(mary, mary, "https://secure-doc.store").post(json(invitation(emailOf(laura))));

        Response response = contactRequests(mary, mary, "https://secure-doc.store").post(json(invitation(emailOf(laura))));

        assertThat(response.getStatus()).isEqualTo(NO_CONTENT.getStatusCode());
    }

    @Test
    @DisplayName("Inviting from a disallowed origin is rejected")
    public void inviteFromDisallowedOrigin() {
        Response response = contactRequests(mary, mary, "https://evil.example.com").post(json(invitation(emailOf(laura))));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    @Test
    @DisplayName("Declining an invitation that was never received records a denial")
    public void declineWithoutPriorInvitation() {
        Response response = contactRequest(mary, mary, laura, "https://secure-doc.store").delete();

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        assertThat(contactRepository.getContactExchange(mary, laura))
            .get().extracting(ContactExchange::status).isEqualTo(ContactStatus.DENIED);
    }

    @Test
    @DisplayName("Re-inviting a user who has denied the request fails with a conflict")
    public void inviteAfterDecline() {
        contactRequest(laura, laura, mary, "https://secure-doc.store").delete();

        Response response = contactRequests(mary, mary, "https://secure-doc.store").post(json(invitation(emailOf(laura))));

        assertThat(response.getStatus()).isEqualTo(CONFLICT.getStatusCode());
    }

    @Test
    @DisplayName("Inviting a not-yet-registered user without a public key still sends an invitation")
    public void inviteUnregisteredUserWithoutKey() {
        Response response = contactRequests(mary, mary, ORIGIN)
            .post(json("{\"invitee\": \"newcomer@imagey.cloud\", \"inviterEmail\": \"mary@imagey.cloud\"}"));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
    }

    @Test
    @DisplayName("Accepting without a chatId is rejected with 400")
    public void acceptWithoutChatId() {
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));

        String acceptBody = "{\"status\": \"ACCEPTED\", \"publicKey\": " + PUBLIC_KEY + ", \"sharedKey\": \"AAAA\"}";
        Response response = contactRequest(laura, laura, mary, ORIGIN).put(json(acceptBody));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    @Test
    @DisplayName("The party that declined an invitation may still invite the other side")
    public void declinerCanReInvite() {
        // mary invites laura, laura declines
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));
        assertThat(contactRequest(laura, laura, mary, ORIGIN).delete().getStatusInfo().getFamily())
            .isEqualTo(SUCCESSFUL);

        // laura (the decliner) now invites mary - allowed, the stale DENIED exchange is overwritten
        Response response = contactRequests(laura, laura, ORIGIN).post(json(invitation(emailOf(mary))));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
        assertThat(contactRepository.getContactExchange(laura, mary))
            .get().extracting(ContactExchange::status).isEqualTo(ContactStatus.INVITED);
    }

    @Test
    @DisplayName("Accepting an invitation that was never sent fails with a conflict")
    public void acceptWithoutInvitation() {
        String acceptBody = "{\"status\": \"ACCEPTED\", \"chatId\": \"chat-x\", \"publicKey\": " + PUBLIC_KEY
            + ", \"sharedKey\": \"AAAA\"}";

        Response response = contactRequest(laura, laura, mary, "https://secure-doc.store").put(json(acceptBody));

        assertThat(response.getStatus()).isEqualTo(CONFLICT.getStatusCode());
    }

    @Test
    @DisplayName("Confirming receipt of an acceptance that never happened fails with a conflict")
    public void confirmReceiptWithoutAcceptance() {
        Response response = contactRequest(mary, mary, laura, "https://secure-doc.store")
            .put(json("{\"status\": \"RECEIVED\"}"));

        assertThat(response.getStatus()).isEqualTo(CONFLICT.getStatusCode());
    }

    @Test
    @DisplayName("Full handshake: invite -> accept -> confirm receipt, with actionability at each step")
    public void fullHandshake() {
        // mary invites laura: only laura has something to act on
        assertThat(contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura)))).getStatus())
            .isEqualTo(CREATED.getStatusCode());
        assertThat(contactRequestsOf(laura)).contains(UserFactory.MARY_ID.id());
        assertThat(contactRequestsOf(mary)).doesNotContain(UserFactory.LAURA_ID.id());

        // laura accepts: now mary has the acceptance to pick up, laura is done
        assertThat(contactRequest(laura, laura, mary, ORIGIN).put(json(acceptBody())).getStatusInfo().getFamily())
            .isEqualTo(SUCCESSFUL);
        assertThat(contactRepository.getContactExchange(laura, mary))
            .get().extracting(ContactExchange::status).isEqualTo(ContactStatus.ACCEPTED);
        assertThat(contactRequestsOf(mary)).contains(UserFactory.LAURA_ID.id());
        assertThat(contactRequestsOf(laura)).doesNotContain(UserFactory.MARY_ID.id());

        // mary confirms she picked up the acceptance
        assertThat(contactRequest(mary, mary, laura, ORIGIN).put(json("{\"status\": \"RECEIVED\"}"))
            .getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        assertThat(contactRepository.getContactExchange(mary, laura))
            .get().extracting(ContactExchange::status).isEqualTo(ContactStatus.RECEIVED);

        // a completed exchange is no longer actionable for either side
        assertThat(contactRequestsOf(mary)).doesNotContain(UserFactory.LAURA_ID.id());
        assertThat(contactRequestsOf(laura)).doesNotContain(UserFactory.MARY_ID.id());
    }

    @Test
    @DisplayName("Declining an invitation that was actually received denies the existing exchange")
    public void declineExistingInvitation() {
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));

        Response response = contactRequest(laura, laura, mary, ORIGIN).delete();

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        assertThat(contactRepository.getContactExchange(laura, mary))
            .get().extracting(ContactExchange::status).isEqualTo(ContactStatus.DENIED);
    }

    @Test
    @DisplayName("Accepting after the invitation was declined fails with a conflict")
    public void acceptAfterDecline() {
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));
        contactRequest(laura, laura, mary, ORIGIN).delete();

        Response response = contactRequest(laura, laura, mary, ORIGIN).put(json(acceptBody()));

        assertThat(response.getStatus()).isEqualTo(CONFLICT.getStatusCode());
    }

    @Test
    @DisplayName("Confirming receipt while the invitation is only pending fails with a conflict")
    public void confirmReceiptWhileStillInvited() {
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));

        Response response = contactRequest(mary, mary, laura, ORIGIN).put(json("{\"status\": \"RECEIVED\"}"));

        assertThat(response.getStatus()).isEqualTo(CONFLICT.getStatusCode());
    }

    @Test
    @DisplayName("A stray non-JSON entry in contact-requests is skipped, not a 500")
    public void strayEntryInContactRequestsIsIgnored() throws IOException {
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));
        File laurasRequests = new File(rootPath, laura.id().id() + "/contact-requests");
        // a leftover directory and an unparseable file, as an on-branch data migration might leave
        new File(laurasRequests, "old-status-dir").mkdirs();
        writeStringToFile(new File(laurasRequests, "notes.txt"), "not json", UTF_8);

        Response response = contactRequests(laura, laura, ORIGIN).get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.readEntity(String.class)).contains(UserFactory.MARY_ID.id());
    }

    @Test
    @DisplayName("An unparseable .json entry in contact-requests is skipped, not a 500")
    public void unparseableJsonEntryInContactRequestsIsSkipped() throws IOException {
        contactRequests(mary, mary, ORIGIN).post(json(invitation(emailOf(laura))));
        File laurasRequests = new File(rootPath, laura.id().id() + "/contact-requests");
        // a half-written entry keeps its .json name, so it reaches parseExchange and must be tolerated there
        writeStringToFile(new File(laurasRequests, "broken.json"), "{ not valid json", UTF_8);

        Response response = contactRequests(laura, laura, ORIGIN).get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.readEntity(String.class)).contains(UserFactory.MARY_ID.id());
    }

    @Test
    @DisplayName("A contact-requests path that is a file, not a directory, yields an empty list")
    public void contactRequestsAsFileYieldsEmptyList() throws IOException {
        writeStringToFile(new File(rootPath, laura.id().id() + "/contact-requests"), "leftover", UTF_8);

        Response response = contactRequests(laura, laura, ORIGIN).get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.readEntity(String.class).replaceAll("\\s", "")).isEqualTo("[]");
    }

    @Test
    @DisplayName("A contact-request update with a disallowed status is rejected with 400")
    public void updateContactRequestWithDisallowedStatus() {
        Response response = contactRequest(laura, laura, mary, ORIGIN).put(json("{\"status\": \"INVITED\"}"));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    private String contactRequestsOf(User owner) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(owner.id().id()).path("contact-requests")
            .request()
            .header("Origin", ORIGIN)
            .cookie(tokenCookie(owner))
            .get(String.class);
    }

    private String acceptBody() {
        return "{\"status\": \"ACCEPTED\", \"chatId\": \"chat-mary-laura\", \"publicKey\": " + PUBLIC_KEY
            + ", \"sharedKey\": \"AAAA\"}";
    }

    private Builder contactRequests(User owner, User tokenUser, String origin) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(owner.id().id()).path("contact-requests")
            .request()
            .header("Origin", origin)
            .cookie(tokenCookie(tokenUser));
    }

    private Builder contactRequest(User owner, User tokenUser, User contact, String origin) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(owner.id().id()).path("contact-requests").path(contact.id().id())
            .request()
            .header("Origin", origin)
            .cookie(tokenCookie(tokenUser));
    }

    private Cookie tokenCookie(User user) {
        return new Cookie.Builder("token").value(tokenService.generateAuthenticationToken(user, MAX_VALUE).token()).build();
    }

    // The invitee is addressed by email (that is how you invite someone); inviterEmail is the
    // caller's own address, needed only for the invitation mail to a not-yet-registered invitee.
    private String invitation(Email invitee) {
        return "{\"invitee\": \"" + invitee.address() + "\","
            + " \"inviterEmail\": \"inviter@imagey.cloud\","
            + " \"publicKey\": " + PUBLIC_KEY + "}";
    }

    private static Email emailOf(User user) {
        if (user.equals(UserFactory.mary())) {
            return UserFactory.MARY_EMAIL;
        }
        if (user.equals(UserFactory.laura())) {
            return UserFactory.LAURA_EMAIL;
        }
        throw new IllegalArgumentException("no test email for " + user);
    }
}
