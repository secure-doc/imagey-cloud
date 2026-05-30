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
package cloud.imagey.domain.chat;

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

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class MessageServiceTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private MessageService messageService;
    @Inject
    private TokenService tokenService;
    @Inject
    private cloud.imagey.application.MessageResource messageResource;
    @Inject
    private cloud.imagey.domain.chat.ContactRepository contactRepository;

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

        receiverCookie = new Cookie("token", tokenService.generateToken(receiver, Integer.MAX_VALUE).token());
        receiverClient = path -> newClient()
                .register(cloud.imagey.infrastructure.jaxrs.RecordMessageBodyReader.class)
                .register(cloud.imagey.infrastructure.jaxrs.RecordListMessageBodyWriter.class)
                .register(cloud.imagey.infrastructure.jaxrs.RecordMessageBodyWriter.class)
                .target("http://localhost:" + config.getHttpPort())
                .path("users").path(receiver.email().address()).path(path)
                .request()
                .cookie(receiverCookie);

        senderCookie = new Cookie("token", tokenService.generateToken(sender, Integer.MAX_VALUE).token());
        senderClient = path -> newClient()
                .register(cloud.imagey.infrastructure.jaxrs.RecordMessageBodyReader.class)
                .register(cloud.imagey.infrastructure.jaxrs.RecordListMessageBodyWriter.class)
                .register(cloud.imagey.infrastructure.jaxrs.RecordMessageBodyWriter.class)
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

    @Test
    void testReceiveMessagesTimeoutHandler() throws Exception {
        contactRepository.persist(sender, receiver, new cloud.imagey.domain.encryption.EncryptedSharedKey("key"));
        jakarta.ws.rs.container.AsyncResponse asyncResponse = new jakarta.ws.rs.container.AsyncResponse() {
            @Override
            public boolean resume(Object response) {
                return true;
            }
            @Override
            public boolean resume(Throwable response) {
                return true;
            }
            @Override
            public boolean cancel() {
                return true;
            }
            @Override
            public boolean cancel(int retryAfter) {
                return true;
            }
            @Override
            public boolean cancel(java.util.Date retryAfter) {
                return true;
            }
            @Override
            public boolean isSuspended() {
                return true;
            }
            @Override
            public boolean isCancelled() {
                return false;
            }
            @Override
            public boolean isDone() {
                return false;
            }
            @Override
            public boolean setTimeout(long time, java.util.concurrent.TimeUnit unit) {
                return true;
            }
            @Override
            public void setTimeoutHandler(jakarta.ws.rs.container.TimeoutHandler handler) {
                handler.handleTimeout(this);
            }
            @Override
            public java.util.Collection<Class<?>> register(Class<?> callback) {
                return null;
            }
            @Override
            public java.util.Map<Class<?>, java.util.Collection<Class<?>>> register(
                Class<?> callback, Class<?>... callbacks) {
                return null;
            }
            @Override
            public java.util.Collection<Class<?>> register(Object callback) {
                return null;
            }
            @Override
            public java.util.Map<Class<?>, java.util.Collection<Class<?>>> register(
                Object callback, Object... callbacks) {
                return null;
            }
        };
        messageResource.receiveMessages(sender, receiver, null, asyncResponse);
    }

    public interface TestClient {
        Builder path(String path);
    }
}
