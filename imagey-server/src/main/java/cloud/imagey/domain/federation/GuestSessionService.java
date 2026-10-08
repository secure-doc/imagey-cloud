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
package cloud.imagey.domain.federation;

import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import cloud.imagey.domain.contact.ContactExchange;
import cloud.imagey.domain.contact.ContactRepository;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.token.TokenService.TokenType;
import cloud.imagey.domain.user.DomainName;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.domain.user.UserMappingService;
import cloud.imagey.domain.user.UserRepository;

/**
 * Turns a verified assertion into a guest session (ADR 0013 decision 2, amendments A5 and A6).
 *
 * <p>The first time ({@code invitationToken}), the invitation proves that the holder has the mailbox
 * and the assertion that their home server vouches for it - both together admit them. The open
 * invitations of the address, filed under a placeholder id, move to the guest's {@code
 * ForeignUserMapping} id. Afterwards ({@code renew}, no token) only the mapping is looked up: a
 * stranger never gets a new identity that way.
 */
@ApplicationScoped
public class GuestSessionService {

    private static final long MILLIS_PER_SECOND = 1000;

    @Inject
    private TokenService tokenService;
    @Inject
    private UserMappingService userMappingService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private ForeignUserMappingService foreignUserMappingService;
    @Inject
    private ContactRepository contactRepository;

    public Session establish(VerifiedAssertion assertion, Optional<Token> invitationToken) {
        UserId guest = invitationToken.isPresent() ? redeemInvitation(assertion, invitationToken.get()) : renew(assertion);
        Token token = tokenService.generateGuestToken(new User(guest), new DomainName(assertion.iss()));
        return new Session(token, guest, TokenService.GUEST_SESSION / MILLIS_PER_SECOND);
    }

    private UserId renew(VerifiedAssertion assertion) {
        return foreignUserMappingService.find(assertion.iss(), assertion.sub())
            .orElseThrow(() -> new InvalidAssertion("no mapping to renew"));
    }

    private UserId redeemInvitation(VerifiedAssertion assertion, Token invitationToken) {
        DecodedToken invitation = tokenService.decode(invitationToken)
            .filter(token -> token.isOfType(TokenType.INVITATION))
            .orElseThrow(() -> new InvalidAssertion("invitation token invalid"));
        // The security check: the mailbox of the invitation is the address the home server vouches for.
        Email invited = FederationAddress.parse(invitation.jwt().getSubject()).orElse(null);
        if (!assertion.sub().equals(invited)) {
            throw new InvalidAssertion("invitation is for another address");
        }
        User placeholder = userMappingService.findUserId(invited).map(User::new)
            .orElseThrow(() -> new InvalidAssertion("no invitation filed for the address"));
        if (userRepository.isRegistered(placeholder)) {
            throw new InvalidAssertion("address has a local account");
        }
        User guest = new User(foreignUserMappingService.register(assertion.iss(), assertion.sub()));
        rehome(placeholder, guest);
        return guest.id();
    }

    // Writes the new copies first and deletes the old ones after: if this stops half way, there is
    // a duplicate at worst, never a lost invitation. All open invitations of the address move, not only
    // the one the link names - the mailbox and the home server prove the address as a whole. The repository
    // lists exactly what waits on the placeholder: INVITED exchanges with the placeholder as invitee.
    private void rehome(User placeholder, User guest) {
        for (ContactExchange exchange : contactRepository.findContactRequests(placeholder)) {
            // The guest may have a contact with the inviter already (from an earlier invitation, since
            // ContactService.invite looks under the placeholder only): that one must not be overwritten
            // by a newer invitation, so the placeholder's copies are just dropped.
            if (contactRepository.getContactExchange(exchange.inviter(), guest).isEmpty()) {
                contactRepository.persist(new ContactExchange(
                    exchange.inviter(), guest, exchange.status(), exchange.publicKey(), exchange.chatId(),
                    exchange.sharedKey(), exchange.publicProfileId(), exchange.contactInfo()));
            }
            contactRepository.delete(exchange.inviter(), placeholder);
            contactRepository.delete(placeholder, exchange.inviter());
        }
    }

    /** The token and the id of the guest on this server. */
    public record Session(Token token, UserId userId, long expiresIn) {
    }
}
