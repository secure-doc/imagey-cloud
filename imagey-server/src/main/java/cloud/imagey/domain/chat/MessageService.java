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

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.container.AsyncResponse;
import javax.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.user.User;

@ApplicationScoped
public class MessageService {

    private static final Logger LOG = LogManager.getLogger(MessageService.class);

    private static final long TIMEOUT_SECONDS = 30;

    @Inject
    private MessageRepository messageRepository;

    private final Map<String, Queue<AsyncResponse>> waitingRequests = new ConcurrentHashMap<>();

    private String getKey(User receiver, User sender) {
        return receiver.email().address() + ":" + sender.email().address();
    }

    public void sendMessage(User sender, User receiver, String encryptedContent) throws IOException {
        Message message = messageRepository.persist(receiver, sender, encryptedContent);
        String key = getKey(receiver, sender);
        Queue<AsyncResponse> queue = waitingRequests.get(key);
        if (queue != null) {
            AsyncResponse asyncResponse;
            while ((asyncResponse = queue.poll()) != null) {
                if (asyncResponse.isSuspended()) {
                    asyncResponse.resume(List.of(message));
                }
            }
        }
    }

    public void receiveMessages(User receiver, User sender, String sinceId, AsyncResponse asyncResponse) {
        try {
            List<Message> messages = messageRepository.fetchMessages(receiver, sender, sinceId);
            if (!messages.isEmpty()) {
                asyncResponse.resume(messages);
                return;
            }

            asyncResponse.setTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            asyncResponse.setTimeoutHandler(ar -> ar.resume(Response.ok(List.of()).build()));

            String key = getKey(receiver, sender);
            waitingRequests.computeIfAbsent(key, k -> new ConcurrentLinkedQueue<>()).add(asyncResponse);

            List<Message> newMessages = messageRepository.fetchMessages(receiver, sender, sinceId);
            if (!newMessages.isEmpty()) {
                if (waitingRequests.get(key).remove(asyncResponse)) {
                    if (asyncResponse.isSuspended()) {
                        asyncResponse.resume(newMessages);
                    }
                }
            }

        } catch (Exception e) {
            LOG.error("Error receiving messages", e);
            asyncResponse.resume(e);
        }
    }
}
