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

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.mail.EmailBody;
import cloud.imagey.domain.mail.EmailSubject;
import cloud.imagey.domain.mail.EmailTemplate;
import cloud.imagey.domain.mail.MailService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserRepository;

@ApplicationScoped
public class ContactService {

    private static final EmailTemplate CONTACT_MAIL = new EmailTemplate(
        new Email("invitation@imagey.cloud"),
        new EmailSubject("Invitation to Imagey"),
        new EmailBody("""
            You are invited to Imagey by %s: To accept the invitation, click <a href=\"%s\">here</a>
        """));

    @Inject
    private MailService mailService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private ContactRepository contactRepository;

    public void invite(User sender, User recipient) throws IOException {
        if (userRepository.exists(recipient)) {
            contactRepository.persist(sender, recipient, ContactStatus.INVITATION_SENT);
            contactRepository.persist(recipient, sender, ContactStatus.INVITATION_RECEIVED);
        } else {
            mailService.send(recipient.email(), CONTACT_MAIL.formatted("https://imagey.cloud/invitations/" + sender.email()));
        }
    }

    public void acceptInvitation(User user, User contact, EncryptedSharedKey key) throws IOException {
        contactRepository.persist(user, contact, key);
        contactRepository.persist(contact, user, key);
    }

    public void rejectInvitation(User user, User requestor) throws IOException {
        contactRepository.persist(user, requestor, ContactStatus.DECLINED_BY_USER);
        contactRepository.persist(requestor, user, ContactStatus.DECLINED_BY_CONTACT);
    }
}
