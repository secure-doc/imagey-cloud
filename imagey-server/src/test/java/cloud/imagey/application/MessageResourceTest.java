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
import static jakarta.ws.rs.core.Response.Status.OK;
import static org.apache.commons.io.FileUtils.forceDelete;
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

import cloud.imagey.domain.chat.Message;
import cloud.imagey.domain.chat.MessageId;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.jaxrs.RecordListMessageBodyWriter;
import cloud.imagey.infrastructure.jaxrs.RecordMessageBodyReader;
import cloud.imagey.infrastructure.jaxrs.RecordMessageBodyWriter;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class MessageResourceTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    private Cookie receiverCookie;
    private Cookie senderCookie;
    private TestClient receiverClient;
    private TestClient senderClient;
    private User receiver;
    private User sender;

    @BeforeEach
    void initializeState() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        receiver = new User(new Email("receiver@example.com"));
        sender = new User(new Email("sender@example.com"));

        receiverCookie = new Cookie.Builder("token").value(tokenService.generateToken(receiver, Integer.MAX_VALUE).token()).build();
        receiverClient = path -> newClient()
                .register(RecordMessageBodyReader.class)
                .register(RecordListMessageBodyWriter.class)
                .register(RecordMessageBodyWriter.class)
                .target("http://localhost:" + config.getHttpPort())
                .path("users").path(receiver.email().address()).path(path)
                .request()
                .cookie(receiverCookie);

        senderCookie = new Cookie.Builder("token").value(tokenService.generateToken(sender, Integer.MAX_VALUE).token()).build();
        senderClient = path -> newClient()
                .register(RecordMessageBodyReader.class)
                .register(RecordListMessageBodyWriter.class)
                .register(RecordMessageBodyWriter.class)
                .target("http://localhost:" + config.getHttpPort())
                .path("users").path(sender.email().address()).path(path)
                .request()
                .cookie(senderCookie);
    }

    @Test
    @DisplayName("Send and receive messages")
    void sendAndReceiveMessages() throws Exception {
        // Send a message
        Response response = senderClient.path("contacts/receiver@example.com/messages")
            .post(text("encrypted-content"));
        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());

        // Receive the message
        List<Message> messages = receiverClient.path("contacts/sender@example.com/messages")
            .get(new GenericType<List<Message>>() { });
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content().value()).isEqualTo("encrypted-content");
    }

    @Test
    @DisplayName("Receive multiple messages with sinceId")
    void receiveMultipleMessagesWithSinceId() throws Exception {
        // Send first message
        Response firstMessage = senderClient.path("contacts/receiver@example.com/messages")
            .post(text("first-content"));
        assertThat(firstMessage.getStatus()).isEqualTo(OK.getStatusCode());

        // Wait a bit to ensure the timestamp in MessageId differs
        Thread.sleep(10);

        // Send second message
        Response secondMessage = senderClient.path("contacts/receiver@example.com/messages")
            .post(text("second-content"));
        assertThat(secondMessage.getStatus()).isEqualTo(OK.getStatusCode());

        // Receive all messages
        List<Message> allMessages = receiverClient.path("contacts/sender@example.com/messages")
            .get(new GenericType<List<Message>>() { });
        assertThat(allMessages).hasSize(2);
        assertThat(allMessages.get(0).content().value()).isEqualTo("first-content");
        assertThat(allMessages.get(1).content().value()).isEqualTo("second-content");

        MessageId firstId = allMessages.get(0).id();

        // Receive messages with sinceId
        List<Message> newMessages = newClient()
            .register(RecordListMessageBodyWriter.class)
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(receiver.email().address()).path("contacts/sender@example.com/messages")
            .queryParam("sinceId", firstId.value())
            .request()
            .cookie(receiverCookie)
            .get(new GenericType<List<Message>>() { });

        assertThat(newMessages).hasSize(1);
        assertThat(newMessages.get(0).content().value()).isEqualTo("second-content");
    }

    @Test
    @DisplayName("Receive messages with long polling")
    void receiveMessagesLongPolling() throws Exception {
        // Start long polling
        Future<List<Message>> futureMessages = receiverClient.path("contacts/sender@example.com/messages")
            .async()
            .get(new GenericType<List<Message>>() { });

        // Wait a bit to ensure long polling is active
        Thread.sleep(500);

        // Send a message
        Response response = senderClient.path("contacts/receiver@example.com/messages")
            .post(text("delayed-content"));
        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());

        // Get the response
        List<Message> messages = futureMessages.get();
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content().value()).isEqualTo("delayed-content");
    }

    public interface TestClient {
        Builder path(String path);
    }
}
