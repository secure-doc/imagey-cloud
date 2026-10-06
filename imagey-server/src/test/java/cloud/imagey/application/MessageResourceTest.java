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
import static jakarta.ws.rs.core.Response.Status.OK;
import static jakarta.ws.rs.core.Response.Status.UNAUTHORIZED;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.apache.commons.io.FileUtils.writeStringToFile;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Future;

import jakarta.inject.Inject;
import jakarta.ws.rs.client.Invocation.Builder;
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

import cloud.imagey.domain.contact.ContactExchange;
import cloud.imagey.domain.contact.ContactRepository;
import cloud.imagey.domain.contact.ContactStatus;
import cloud.imagey.domain.contact.Message;
import cloud.imagey.domain.contact.MessageId;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.infrastructure.jakartars.RecordListMessageBodyWriter;
import cloud.imagey.infrastructure.jakartars.RecordMessageBodyReader;
import cloud.imagey.infrastructure.jakartars.RecordMessageBodyWriter;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class MessageResourceTest {

    // Messages hang off the chat's Document ({owner}/documents/{chatId}/messages), so the tests
    // only need a chatId and - for the non-owner party - a shared key they issued filed under the
    // chat Document so the "member" role resolves (see RolesFilter / DocumentRepository.hasDirectGrant).
    private static final String CHAT_ID = "test-chat-id";

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;
    @Inject
    private ContactRepository contactRepository;

    private Cookie ownerCookie;
    private Cookie contactCookie;
    private TestClient ownerClient;
    private TestClient contactClient;
    private User owner;
    private User contact;

    @BeforeEach
    void initializeState() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        owner = new User(new UserId("owner"));
        contact = new User(new UserId("contact"));

        // The chat Document must exist in the owner's tree for messages to be accepted there
        // (MessageService guards against a member creating a stray messages folder in their own).
        writeStringToFile(
            new File(data, "owner/documents/" + CHAT_ID + "/metadata.enc"),
            "encrypted-chat-metadata",
            UTF_8);

        // The non-owner party only reaches the chat via the "member" role: a direct-grant key they
        // issued (issuer == kid == themselves), filed under the chat Document owned by `owner` -
        // exactly what ContactService.confirmReceipt syncs there in the real flow.
        documentRepository.create(owner, new DocumentId(CHAT_ID), new EncryptedSharedKey(
            contact, new Kid(contact.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));

        ownerCookie = tokenCookie(owner);
        ownerClient = messages(owner, ownerCookie);

        contactCookie = tokenCookie(contact);
        contactClient = messages(contact, contactCookie);
    }

    private Cookie tokenCookie(User user) {
        return new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(user, Integer.MAX_VALUE).token())
            .build();
    }

    private TestClient messages(User user, Cookie cookie) {
        return sinceId -> {
            var target = newClient()
                .register(RecordMessageBodyReader.class)
                .register(RecordListMessageBodyWriter.class)
                .register(RecordMessageBodyWriter.class)
                .target("http://localhost:" + config.getHttpPort())
                .path("users/owner/documents/" + CHAT_ID + "/messages");
            if (sinceId != null) {
                target = target.queryParam("sinceId", sinceId);
            }
            return target.request().cookie(cookie);
        };
    }

    @Test
    @DisplayName("Sending into a chat that does not exist in the addressed owner's tree is rejected with 404")
    void sendMessageToNonExistentChat() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/no-such-chat/messages")
            .request()
            .cookie(ownerCookie)
            .post(text("encrypted-content"));

        assertThat(response.getStatus()).isEqualTo(Response.Status.NOT_FOUND.getStatusCode());
    }

    @Test
    @DisplayName("Send and receive messages")
    void sendAndReceiveMessages() throws Exception {
        Response response = contactClient.messages(null).post(text("encrypted-content"));
        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
        assertThat(response.getLocation().toString())
            .matches(".*/users/owner/documents/" + CHAT_ID + "/messages/.*");

        List<Message> messages = ownerClient.messages(null).get(new GenericType<List<Message>>() { });
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content().value()).isEqualTo("encrypted-content");
        assertThat(messages.get(0).sender().id().id()).isEqualTo("contact");
    }

    @Test
    @DisplayName("A sent message is answered with, and stored with, the server's timestamp (ADR 0021)")
    void sendStampsTheMessage() {
        Response response = contactClient.messages(null).post(text("encrypted-content"));
        String body = response.readEntity(String.class);
        String location = response.getLocation().toString();
        String id = location.substring(location.lastIndexOf('/') + 1);

        assertThat(body).matches("\\{.*\"id\":\"" + id + "\".*\"timestamp\":\"\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z\".*}");
        assertThat(body).doesNotContain("encrypted-content");

        Message stored = ownerClient.messages(null).get(new GenericType<List<Message>>() { }).get(0);
        assertThat(body).contains(stored.timestamp().value());
        // The id's millisecond prefix and the timestamp stem from the same instant.
        assertThat(stored.timestamp().instant().toEpochMilli()).isEqualTo(Long.parseLong(id.substring(0, id.indexOf('-'))));
    }

    @Test
    @DisplayName("A message stored without timestamp gets it from the time prefix of its id, if there is one")
    void legacyMessagesFallBackToTheIdPrefix() throws IOException {
        writeMessage("1759755792481-legacy", "{\"sender\":\"contact\",\"content\":\"old\"}");

        List<Message> messages = ownerClient.messages(null).get(new GenericType<List<Message>>() { });
        assertThat(messages).extracting(m -> m.id().value()).containsExactly("1759755792481-legacy");
        assertThat(messages.get(0).timestamp().value()).isEqualTo("2025-10-06T13:03:12.481Z");

        Response single = newClient()
            .register(RecordMessageBodyReader.class)
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages/1759755792481-legacy")
            .request()
            .cookie(ownerCookie)
            .get();
        assertThat(single.readEntity(Message.class).timestamp().value()).isEqualTo("2025-10-06T13:03:12.481Z");
    }

    @Test
    @DisplayName("HEAD reports the time of the newest message as Last-Modified, and nothing for an empty chat")
    void lastActivity() throws IOException {
        Response empty = messagesOf(CHAT_ID, ownerCookie).head();
        assertThat(empty.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(empty.getLastModified()).isNull();

        writeMessage("1759755792481-first", "{\"sender\":\"contact\",\"content\":\"a\"}");
        writeMessage("1759759392481-second", "{\"sender\":\"contact\",\"content\":\"b\"}");
        Response response = messagesOf(CHAT_ID, contactCookie).head();
        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.getLastModified()).isEqualTo(Date.from(Instant.parse("2025-10-06T14:03:12Z")));
    }

    @Test
    @DisplayName("HEAD of a chat is only allowed for its members")
    void lastActivityRequiresAccess() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages")
            .request()
            .head();

        assertThat(response.getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    private void writeMessage(String id, String json) throws IOException {
        writeStringToFile(new File(rootPath, "owner/documents/" + CHAT_ID + "/messages/" + id + ".json"), json, UTF_8);
    }

    @Test
    @DisplayName("Receive multiple messages with sinceId")
    void receiveMultipleMessagesWithSinceId() throws Exception {
        Response firstMessage = contactClient.messages(null).post(text("first-content"));
        assertThat(firstMessage.getStatus()).isEqualTo(CREATED.getStatusCode());

        // Wait a bit to ensure the timestamp in MessageId differs
        Thread.sleep(10);

        Response secondMessage = contactClient.messages(null).post(text("second-content"));
        assertThat(secondMessage.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<Message> allMessages = ownerClient.messages(null).get(new GenericType<List<Message>>() { });
        assertThat(allMessages).hasSize(2);
        assertThat(allMessages.get(0).content().value()).isEqualTo("first-content");
        assertThat(allMessages.get(1).content().value()).isEqualTo("second-content");

        MessageId firstId = allMessages.get(0).id();

        List<Message> newMessages = ownerClient.messages(firstId.value())
            .get(new GenericType<List<Message>>() { });

        assertThat(newMessages).hasSize(1);
        assertThat(newMessages.get(0).content().value()).isEqualTo("second-content");
    }

    @Test
    @DisplayName("Receive messages with long polling")
    void receiveMessagesLongPolling() throws Exception {
        Future<List<Message>> futureMessages = ownerClient.messages(null)
            .header("Prefer", "wait=30")
            .async()
            .get(new GenericType<List<Message>>() { });

        // Wait a bit to ensure long polling is active
        Thread.sleep(500);

        Response response = contactClient.messages(null).post(text("delayed-content"));
        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<Message> messages = futureMessages.get();
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content().value()).isEqualTo("delayed-content");
    }

    @Test
    @DisplayName("Prefer header with number format exception falls back to 0 timeout")
    void testPreferHeaderNumberFormatException() throws Exception {
        Response response = ownerClient.messages(null)
            .header("Prefer", "wait=999999999999999999999999999999999999999")
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
    }

    @Test
    @DisplayName("Invalid Prefer header format falls back to 0 timeout")
    void testInvalidPreferHeaderFormat() throws Exception {
        Response response = ownerClient.messages(null)
            .header("Prefer", "invalid-prefer-value")
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
    }

    @Test
    @DisplayName("A single message is fetched by id, and a missing one is a 404")
    void fetchSingleMessage() throws Exception {
        Response sendResponse = contactClient.messages(null).post(text("encrypted-content"));
        String location = sendResponse.getLocation().toString();
        String messageId = location.substring(location.lastIndexOf('/') + 1);

        Response response = newClient()
            .register(RecordMessageBodyReader.class)
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages/" + messageId)
            .request()
            .cookie(ownerCookie)
            .get();
        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.readEntity(Message.class).content().value()).isEqualTo("encrypted-content");

        Response missing = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages/no-such-message")
            .request()
            .cookie(ownerCookie)
            .get();
        assertThat(missing.getStatus()).isEqualTo(Response.Status.NOT_FOUND.getStatusCode());
    }

    @Test
    @DisplayName("A Notify header naming a real chat member does not block sending")
    void sendWithNotifyHeader() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages")
            .request()
            .cookie(contactCookie)
            .header("Notify", "owner, " + contact.id().id())
            .post(text("encrypted-content"));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
    }

    @Test
    @DisplayName("A Notify header naming someone with no access to the chat does not block sending")
    void sendWithNotifyHeaderNamingAStranger() {
        assertThat(notifyRequest("someone-with-no-access").getStatus()).isEqualTo(CREATED.getStatusCode());
    }

    @Test
    @DisplayName("A Notify header naming a member reached only through a direct grant (not owner/sender) does not block sending")
    void sendWithNotifyHeaderNamingAMemberViaDirectGrant() {
        // The owner sends, naming `contact` - who is reached only via the direct grant filed in
        // initializeState(), not because they are the owner or the sender.
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages")
            .request()
            .cookie(ownerCookie)
            .header("Notify", contact.id().id())
            .post(text("encrypted-content"));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
    }

    @Test
    @DisplayName("A Notify header naming a provisional member (accepted, chat not yet created) does not block sending")
    void sendWithNotifyHeaderNamingAProvisionalMember() {
        String pendingChat = "pending-chat-notify";
        User otherContact = new User(new UserId("other-contact"));
        acceptedExchange(pendingChat, ContactStatus.ACCEPTED);
        contactRepository.persist(new ContactExchange(
            owner, otherContact, ContactStatus.ACCEPTED, null, new DocumentId(pendingChat),
            new EncryptedSymmetricKey("d3JhcHBlZA=="), null, null));

        // Sent by `contact` (themselves a provisional member, so the chat-existence guard passes) and
        // notifies `otherContact` - reached only via their own, separate provisional membership of the
        // same pending chat, not because they are the owner, the sender or direct-grant reachable.
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + pendingChat + "/messages")
            .request()
            .cookie(contactCookie)
            .header("Notify", otherContact.id().id())
            .post(text("encrypted-content"));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
    }

    @Test
    @DisplayName("A blank Notify header behaves exactly like no header")
    void blankNotifyHeaderIsIgnored() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages")
            .request()
            .cookie(contactCookie)
            .header("Notify", "")
            .post(text("encrypted-content"));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());
    }

    @Test
    @DisplayName("A malformed Notify header (empty or path-like recipient, or too many) is rejected with 400")
    void malformedNotifyHeaderIsRejected() {
        assertThat(notifyRequest("owner,,").getStatus()).isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
        assertThat(notifyRequest("../contact").getStatus()).isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
        assertThat(notifyRequest("owner/contact").getStatus()).isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
        assertThat(notifyRequest(String.join(",", Collections.nCopies(257, "x"))).getStatus())
            .isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
    }

    private Response notifyRequest(String notify) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + CHAT_ID + "/messages")
            .request()
            .cookie(contactCookie)
            .header("Notify", notify)
            .post(text("encrypted-content"));
    }

    @Test
    @DisplayName("The invitee of an accepted exchange can send and read messages before the chat exists")
    void provisionalMemberSendsAndReceivesBeforeChatExists() {
        String pendingChat = "pending-chat";
        acceptedExchange(pendingChat, ContactStatus.ACCEPTED);

        Response response = messagesOf(pendingChat, contactCookie).post(text("early-content"));
        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<Message> messages = messagesOf(pendingChat, contactCookie).get(new GenericType<List<Message>>() { });
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).sender().id().id()).isEqualTo("contact");
    }

    @Test
    @DisplayName("Provisional membership is re-checked on every request, so a decline withdraws it")
    void provisionalMembershipIsNotCached() {
        String pendingChat = "pending-chat-declined";
        acceptedExchange(pendingChat, ContactStatus.ACCEPTED);
        assertThat(messagesOf(pendingChat, contactCookie).post(text("early-content")).getStatus())
            .isEqualTo(CREATED.getStatusCode());

        acceptedExchange(pendingChat, ContactStatus.DENIED);

        assertThat(messagesOf(pendingChat, contactCookie).post(text("late-content")).getStatus())
            .isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("Provisional membership covers only the chat id named in the exchange")
    void provisionalMembershipIsBoundToChatId() {
        acceptedExchange("pending-chat", ContactStatus.ACCEPTED);

        assertThat(messagesOf("other-chat", contactCookie).post(text("content")).getStatus())
            .isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("Provisional membership covers only the messages, not the chat document itself")
    void provisionalMembershipDoesNotCoverTheDocument() {
        acceptedExchange("pending-chat", ContactStatus.ACCEPTED);
        writeChatMetadata("pending-chat");

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/pending-chat")
            .request()
            .cookie(contactCookie)
            .get();

        assertThat(response.getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    private void acceptedExchange(String chatId, ContactStatus status) {
        contactRepository.persist(new ContactExchange(
            owner, contact, status, null, new DocumentId(chatId), new EncryptedSymmetricKey("d3JhcHBlZA=="), null, null));
    }

    private void writeChatMetadata(String chatId) {
        try {
            writeStringToFile(new File(rootPath, "owner/documents/" + chatId + "/metadata.enc"), "chat", UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private Builder messagesOf(String chatId, Cookie cookie) {
        return newClient()
            .register(RecordMessageBodyReader.class)
            .target("http://localhost:" + config.getHttpPort())
            .path("users/owner/documents/" + chatId + "/messages")
            .request()
            .cookie(cookie);
    }

    public interface TestClient {
        Builder messages(String query);
    }
}
