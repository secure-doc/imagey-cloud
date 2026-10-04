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
import java.util.Set;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.push.MessagePayload;
import cloud.imagey.domain.push.PushEvent;
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
    private ContactService contactService;
    @Inject
    private Event<Message> messageEvent;
    @Inject
    private Event<PushEvent> pushEvent;

    public Message sendMessage(
        User owner, DocumentId chatId, User sender, MessageContent encryptedContent, Set<User> notify)
            throws IOException {

        // RolesFilter grants "owner" to any caller who puts their own userId in {userId}, so a chat
        // member could address /{self}/documents/{chatId}/messages and silently create a stray
        // messages folder in their own tree - a 201 for a message nobody else can read. Messages
        // are single-copy (kept only in the chat owner's tree), so require the chat document to
        // actually exist there - or, before the inviter has created it, the sender to be the
        // invitee of an accepted exchange naming exactly this chat (ADR 0015 decision 4).
        if (!documentRepository.documentExists(owner, chatId)
            && !contactService.isProvisionalChatMember(owner, chatId, sender)) {
            throw new ResourceNotFoundException(
                "Chat " + chatId.id() + " does not exist for " + owner.id().id() + ".");
        }
        Message message = messageRepository.persist(owner, chatId, sender, encryptedContent);
        messageEvent.fire(message);
        firePushEvents(owner, chatId, sender, message.id(), notify);
        return message;
    }

    // ADR 0020 decision 4: the client asserts who to notify, but only recipients that already pass
    // the ordinary chat access check actually get pushed - the header cannot be used to spam anyone
    // else. Never delays or fails the request: fired asynchronously, and a recipient without access
    // is silently skipped (logged at DEBUG), not rejected.
    private void firePushEvents(User owner, DocumentId chatId, User sender, MessageId messageId, Set<User> notify) {
        for (User recipient : notify) {
            if (recipient.equals(sender)) {
                continue;
            }
            if (recipient.equals(owner)
                || documentRepository.hasDirectGrant(owner, chatId, recipient)
                || contactService.isProvisionalChatMember(owner, chatId, recipient)) {
                pushEvent.fireAsync(new PushEvent(recipient, new MessagePayload(owner, chatId, messageId)));
            } else {
                LOG.debug("Skipping push notification to {}: not a member of chat {}", recipient, chatId);
            }
        }
    }
}
