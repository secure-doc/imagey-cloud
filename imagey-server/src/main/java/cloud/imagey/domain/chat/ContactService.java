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
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.ws.rs.BadRequestException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.mail.EmailBody;
import cloud.imagey.domain.mail.EmailSubject;
import cloud.imagey.domain.mail.EmailTemplate;
import cloud.imagey.domain.mail.MailService;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.DomainName;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserRepository;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class ContactService {

    private static final Logger LOG = LogManager.getLogger(ContactService.class);

    @Inject
    private TokenService tokenService;
    @Inject
    private MailService mailService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private ContactRepository contactRepository;
    @Inject
    private Provider<DomainName> currentDomain;
    @Inject
    @ConfigProperty(name = "secure-doc.urls")
    private List<DomainName> allowedUrls;
    @Inject
    @ConfigProperty(name = "mail.invitation.subject")
    private EmailSubject invitationSubject;
    @Inject
    @ConfigProperty(name = "mail.invitation.body")
    private EmailBody invitationBody;

    public boolean invite(User sender, User recipient) throws IOException {
        DomainName domain = currentDomain.get();
        if (!allowedUrls.contains(domain)) {
            throw new BadRequestException("Invalid client URL");
        }

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
            String link = domain.value() + "/invitations/" + token.token() + "?invited-by=" + sender.email().address();
            mailService.send(recipient.email(), new EmailTemplate(
                new Email("invitation@" + domain.getHost()),
                invitationSubject,
                invitationBody
            ).formatted(domain.getAppName(), sender.email().address(), link));
            return true;
        }
    }

    public void acceptInvitation(User user, User contact, ContactKeys keys) throws IOException {
        if (contactRepository.getContactStatus(user, contact).filter(INVITATION_RECEIVED::equals).isPresent()) {
            contactRepository.persist(user, contact, keys.key());
            if (keys.invitationKey() != null) {
                contactRepository.persist(contact, user, keys.invitationKey());
            } else {
                contactRepository.persist(contact, user, keys.key());
            }
        } else {
            throw new ResourceConflictException("Contact request rejected");
        }
    }

    public void declineInvitation(User user, User requestor) throws IOException {
        contactRepository.persist(user, requestor, ContactStatus.DENIAL_SENT);
        contactRepository.persist(requestor, user, ContactStatus.DENIAL_RECEIVED);
    }
}
