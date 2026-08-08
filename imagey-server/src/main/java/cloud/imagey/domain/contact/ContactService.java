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

import static cloud.imagey.domain.contact.ContactStatus.DENIED;
import static cloud.imagey.domain.contact.ContactStatus.INVITED;
import static cloud.imagey.domain.token.TokenService.ONE_WEEK;

import java.io.IOException;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.validation.ValidationException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.mail.EmailBody;
import cloud.imagey.domain.mail.EmailSubject;
import cloud.imagey.domain.mail.EmailTemplate;
import cloud.imagey.domain.mail.MailService;
import cloud.imagey.domain.token.Kid;
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

    public boolean invite(User sender, Email recipient, PublicKey key) throws IOException {
        DomainName domain = currentDomain.get();
        if (!allowedUrls.contains(domain)) {
            throw new ValidationException("Invalid client URL");
        }

        if (userRepository.exists(new User(recipient))) {
            ContactExchange currentExchange = contactRepository.getContactExchange(sender, new User(recipient)).orElse(null);
            if (currentExchange != null && currentExchange.status() == DENIED) {
                throw new ResourceConflictException("Contact request rejected");
            }
            if (currentExchange == null) {
                contactRepository.persist(new ContactExchange(sender, recipient, INVITED, key, null, null));
                return true;
            }
            return false;
        } else {
            contactRepository.persist(new ContactExchange(sender, recipient, INVITED, key, null, null));
            Token token = tokenService.generateToken(new User(recipient), ONE_WEEK); // TODO add public key to token
            String link = domain.value() + "/invitations/" + token.token() + "?invited-by=" + sender.email().address();
            mailService.send(recipient, new EmailTemplate(
                new Email("invitation@" + domain.getHost()),
                invitationSubject,
                invitationBody
            ).formatted(domain.getAppName(), sender.email().address(), link));
            return true;
        }
    }

    public void acceptInvitation(User user, User inviter, DocumentId documentId, EncryptedSymmetricKey key) throws IOException {
        ContactExchange exchange = contactRepository.getContactExchange(user, inviter)
            .filter(e -> e.status() == INVITED)
            .orElseThrow(() -> new ResourceConflictException("Contact request rejected"));

        EncryptedSharedKey encryptedSharedKey = new EncryptedSharedKey(inviter, new Kid("0"), key);
        ContactExchange accepted = new ContactExchange(
            exchange.inviter(), exchange.invitee(), exchange.status(), exchange.publicKey(),
            documentId, encryptedSharedKey);
        contactRepository.persist(accepted);
    }

    public void declineInvitation(User user, User requestor) throws IOException {
        ContactExchange exchange = contactRepository.getContactExchange(user, requestor).orElse(null);
        if (exchange != null) {
            contactRepository.persist(new ContactExchange(
                exchange.inviter(), exchange.invitee(), DENIED, exchange.publicKey(), exchange.documentId(), exchange.sharedKey()));
        } else {
            contactRepository.persist(new ContactExchange(requestor, user.email(), DENIED, null, null, null));
        }
    }
}
