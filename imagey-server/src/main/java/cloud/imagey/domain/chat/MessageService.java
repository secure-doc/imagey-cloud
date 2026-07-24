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

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.user.User;

@ApplicationScoped
public class MessageService {

    private static final Logger LOG = LogManager.getLogger(MessageService.class);

    @Inject
    private MessageRepository messageRepository;
    @Inject
    private Event<Message> messageEvent;

    public Message sendMessage(User user, User sender, DocumentId documentId, MessageContent encryptedContent) throws IOException {
        Message message = messageRepository.persist(user, sender, documentId, encryptedContent);
        messageEvent.fire(message);
        return message;
    }
}
