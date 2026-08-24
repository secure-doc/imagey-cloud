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

import static cloud.imagey.domain.contact.ContactStatus.ACCEPTED;
import static cloud.imagey.domain.contact.ContactStatus.DENIED;
import static cloud.imagey.domain.contact.ContactStatus.INVITED;
import static cloud.imagey.domain.contact.ContactStatus.RECEIVED;
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
import cloud.imagey.domain.document.DocumentRepository;
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
    private DocumentRepository documentRepository;
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

        User recipientUser = new User(recipient);
        // "Registered", not merely "has a home directory": ContactRepository.persist creates the
        // invitee's tree, so a pending invite from someone else must not make this look like an
        // existing account (which would suppress the invitation email and mis-route the invitee to
        // a login link instead of registration).
        boolean registered = userRepository.isRegistered(recipientUser);
        ContactExchange currentExchange = contactRepository.getContactExchange(sender, recipientUser).orElse(null);
        if (currentExchange != null && currentExchange.status() == DENIED) {
            // Block only the party whose request was denied from re-sending it. The party that did
            // the declining stays free to invite the other side - their fresh INVITED exchange
            // overwrites the stale DENIED one.
            if (sender.equals(currentExchange.inviter())) {
                throw new ResourceConflictException("Contact request rejected");
            }
        } else if (currentExchange != null) {
            // A pending or completed exchange between these two already exists; nothing to re-send.
            return false;
        }

        contactRepository.persist(new ContactExchange(sender, recipient, INVITED, key, null, null));

        if (!registered) {
            // The invitee accepts this request as the last step of registration; it reads the
            // inviter's public main key straight off its own persisted contact-request entry
            // (GET /users/{invitee}/contact-requests) rather than from the link.
            Token token = tokenService.generateToken(recipientUser, ONE_WEEK);
            String link = domain.value() + "/invitations/" + token.token() + "?invited-by=" + sender.email().address();
            mailService.send(recipient, new EmailTemplate(
                new Email("invitation@" + domain.getHost()),
                invitationSubject,
                invitationBody
            ).formatted(domain.getAppName(), sender.email().address(), link));
        }
        return true;
    }

    // Called by the invitee (see ContactResource.updateContactRequest): they overwrite the
    // placeholder public key from the original invite with their own, and hand over the chat
    // document id plus the chat key ECDH-wrapped for the inviter.
    public void acceptInvitation(User invitee, User inviter, PublicKey publicKey, DocumentId chatId, EncryptedSymmetricKey sharedKey)
            throws IOException {

        if (chatId == null) {
            throw new ValidationException("An accepted contact request must carry a chatId.");
        }

        ContactExchange exchange = contactRepository.getContactExchange(invitee, inviter)
            .filter(e -> e.status() == INVITED)
            .orElseThrow(() -> new ResourceConflictException("Contact request rejected"));

        ContactExchange accepted = new ContactExchange(
            exchange.inviter(), exchange.invitee(), ACCEPTED, publicKey, chatId, sharedKey);
        contactRepository.persist(accepted);
    }

    // Called by the inviter once they have picked up the invitee's acceptance (decrypted their
    // ECDH-shared copy of the chat key and recorded the invitee as a contact) - this closes out
    // the exchange so it stops showing as actionable for either side.
    //
    // {@code chatKey} is the chat key re-wrapped by the inviter under their own chats-document key
    // (issuer = the inviter). We file it under the chat document (in the invitee's tree, its
    // canonical home) - that key entry is what grants the inviter the "member" role on the chat
    // from then on, see RolesFilter / DocumentRepository.isIssuerInKeyChain. It is optional only so
    // an inviter on an older client (see ContactRequestTest) can still close out the handshake; the
    // exchange always carries a chatId once ACCEPTED (see acceptInvitation).
    public void confirmReceipt(User inviter, User invitee, EncryptedSharedKey chatKey) throws IOException {
        ContactExchange exchange = contactRepository.getContactExchange(inviter, invitee)
            .filter(e -> e.status() == ACCEPTED)
            .orElseThrow(() -> new ResourceConflictException("Contact request rejected"));

        if (chatKey != null) {
            // exchange.chatId() is non-null here: acceptInvitation rejects an ACCEPTED transition
            // without one, and this method only proceeds for an ACCEPTED exchange.
            documentRepository.create(invitee, exchange.chatId(),
                new EncryptedSharedKey(inviter, new Kid(inviter.email().address()), chatKey.sharedKey()));
        }

        ContactExchange received = new ContactExchange(
            exchange.inviter(), exchange.invitee(), RECEIVED, exchange.publicKey(), exchange.chatId(), exchange.sharedKey());
        contactRepository.persist(received);
    }

    public void declineInvitation(User user, User requestor) throws IOException {
        ContactExchange exchange = contactRepository.getContactExchange(user, requestor).orElse(null);
        if (exchange != null) {
            contactRepository.persist(new ContactExchange(
                exchange.inviter(), exchange.invitee(), DENIED, exchange.publicKey(), exchange.chatId(), exchange.sharedKey()));
        } else {
            contactRepository.persist(new ContactExchange(requestor, user.email(), DENIED, null, null, null));
        }
    }
}
