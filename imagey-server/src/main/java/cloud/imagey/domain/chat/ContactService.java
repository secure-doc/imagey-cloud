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

import static cloud.imagey.domain.chat.ContactStatus.DENIAL_RECEIVED;
import static cloud.imagey.domain.chat.ContactStatus.DENIAL_SENT;
import static cloud.imagey.domain.chat.ContactStatus.INVITATION_RECEIVED;
import static cloud.imagey.domain.token.TokenService.ONE_WEEK;

import java.io.IOException;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.mail.EmailBody;
import cloud.imagey.domain.mail.EmailSubject;
import cloud.imagey.domain.mail.EmailTemplate;
import cloud.imagey.domain.mail.MailService;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserRepository;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class ContactService {

    private static final Logger LOG = LogManager.getLogger(ContactService.class);

    private static final EmailTemplate CONTACT_MAIL = new EmailTemplate(
        new Email("invitation@imagey.cloud"),
        new EmailSubject("Invitation to Imagey"),
        new EmailBody("""
            You are invited to Imagey by %s: To accept the invitation, click <a href=\"%s\">here</a>
        """));

    @Inject
    private TokenService tokenService;
    @Inject
    private MailService mailService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private ContactRepository contactRepository;

    public boolean invite(User sender, User recipient) throws IOException {
        if (userRepository.exists(recipient)) {
            ContactStatus currentStatus = contactRepository.getContactStatus(sender, recipient).orElse(null);
            if (currentStatus == DENIAL_RECEIVED) {
                throw new ResourceConflictException("Contact request rejected");
            }
            if (currentStatus == null || currentStatus == DENIAL_SENT) {
                contactRepository.persist(sender, recipient, ContactStatus.INVITATION_SENT);
                contactRepository.persist(recipient, sender, ContactStatus.INVITATION_RECEIVED);
                return true;
            }
            contactRepository.persist(recipient, sender, ContactStatus.INVITATION_RECEIVED);
            return false;
        } else {
            contactRepository.persist(sender, recipient, ContactStatus.INVITATION_SENT);
            Token token = tokenService.generateToken(recipient, ONE_WEEK);
            mailService.send(
                recipient.email(),
                CONTACT_MAIL.formatted(
                sender.email().address(),
                "https://imagey.cloud/invitations/" + token.token() + "?invited-by=" + sender.email().address()));
            return true;
        }
    }

    public void acceptInvitation(User user, User contact, EncryptedSharedKey key) throws IOException {
        if (contactRepository.getContactStatus(user, contact).filter(INVITATION_RECEIVED::equals).isPresent()) {
            contactRepository.persist(user, contact, key);
            contactRepository.persist(contact, user, key);
        } else {
            throw new ResourceConflictException("Contact request rejected");
        }
    }

    public void declineInvitation(User user, User requestor) throws IOException {
        contactRepository.persist(user, requestor, ContactStatus.DENIAL_SENT);
        contactRepository.persist(requestor, user, ContactStatus.DENIAL_RECEIVED);
    }
}
