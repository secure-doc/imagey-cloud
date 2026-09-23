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
            owner, contact, status, null, new DocumentId(chatId), new EncryptedSymmetricKey("d3JhcHBlZA=="), null));
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
