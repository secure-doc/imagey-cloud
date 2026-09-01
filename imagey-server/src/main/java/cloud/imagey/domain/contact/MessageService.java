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
package cloud.imagey.domain.contact;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.ResourceNotFoundException;

@ApplicationScoped
public class MessageService {

    private static final Logger LOG = LogManager.getLogger(MessageService.class);

    @Inject
    private MessageRepository messageRepository;
    @Inject
    private DocumentRepository documentRepository;
    @Inject
    private Event<Message> messageEvent;

    public Message sendMessage(User owner, DocumentId chatId, User sender, MessageContent encryptedContent) throws IOException {
        // RolesFilter grants "owner" to any caller who puts their own userId in {userId}, so a chat
        // member could address /{self}/documents/{chatId}/messages and silently create a stray
        // messages folder in their own tree - a 201 for a message nobody else can read. Messages
        // are single-copy (kept only in the chat owner's tree), so require the chat document to
        // actually exist there.
        if (!documentRepository.documentExists(owner, chatId)) {
            throw new ResourceNotFoundException(
                "Chat " + chatId.id() + " does not exist for " + owner.id().id() + ".");
        }
        Message message = messageRepository.persist(owner, chatId, sender, encryptedContent);
        messageEvent.fire(message);
        return message;
    }
}
