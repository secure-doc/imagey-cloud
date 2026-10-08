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

import static cloud.imagey.domain.contact.ContactStatus.INVITED;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.UserFactory;
import cloud.imagey.domain.contact.ContactExchange;
import cloud.imagey.domain.contact.ContactRepository;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.domain.user.UserMappingService;

@MonoMeecrowaveConfig
public class GuestSessionServiceTest {

    private static final String HOME = "foreign.test";

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private GuestSessionService service;
    @Inject
    private ForeignUserMappingService foreignUserMappingService;
    @Inject
    private UserMappingService userMappingService;
    @Inject
    private ContactRepository contactRepository;
    @Inject
    private TokenService tokenService;

    private Email bob;

    @BeforeEach
    void setUp() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
        bob = new Email("bob-" + System.nanoTime() + "@gmail.com");
    }

    @Test
    @DisplayName("The first redemption with the invitation maps the guest and moves the invitation to its id")
    void redeems() {
        User placeholder = invite(UserFactory.mary(), "chat-1");

        GuestSessionService.Session session = service.establish(assertion(bob), Optional.of(invitation(bob)));

        UserId guest = foreignUserMappingService.find(HOME, bob).orElseThrow();
        assertThat(session.userId()).isEqualTo(guest).isNotEqualTo(placeholder.id());
        assertThat(session.expiresIn()).isEqualTo(900);
        DecodedToken token = tokenService.decode(session.token()).orElseThrow();
        assertThat(token.jwt().getSubject()).isEqualTo(guest.id());
        assertThat(token.guestDomain()).contains(HOME);
        assertThat(contactRepository.findContactRequests(new User(guest))).hasSize(1)
            .allSatisfy(exchange -> assertThat(exchange.invitee()).isEqualTo(new User(guest)));
        assertThat(contactRepository.getContactExchange(UserFactory.mary(), new User(guest))).isPresent();
        // the inviter sees the exchange once, under the new id; the placeholder's copies are gone
        assertThat(contactRepository.getContactExchange(UserFactory.mary(), placeholder)).isEmpty();
        assertThat(contactRepository.getContactExchange(placeholder, UserFactory.mary())).isEmpty();
    }

    @Test
    @DisplayName("All open invitations of the address move, also those of different inviters")
    void movesAllInvitations() {
        User placeholder = invite(UserFactory.mary(), "chat-a");
        invite(UserFactory.joe(), "chat-b");

        UserId guest = service.establish(assertion(bob), Optional.of(invitation(bob))).userId();

        List<ContactExchange> exchanges = contactRepository.findContactRequests(new User(guest));
        assertThat(exchanges).extracting(ContactExchange::inviter).containsExactlyInAnyOrder(UserFactory.mary(), UserFactory.joe());
        assertThat(contactRepository.findContactRequests(placeholder)).isEmpty();
    }

    @Test
    @DisplayName("Redeeming again is idempotent: the same guest, nothing duplicated")
    void idempotent() {
        invite(UserFactory.mary(), "chat-1");
        UserId first = service.establish(assertion(bob), Optional.of(invitation(bob))).userId();

        UserId second = service.establish(assertion(bob), Optional.of(invitation(bob))).userId();

        assertThat(second).isEqualTo(first);
        assertThat(contactRepository.findContactRequests(new User(first))).hasSize(1);
    }

    @Test
    @DisplayName("A newer invitation of the same inviter does not overwrite the contact the guest already has")
    void keepsExistingContact() {
        User placeholder = invite(UserFactory.mary(), "chat-old");
        UserId guest = service.establish(assertion(bob), Optional.of(invitation(bob))).userId();
        DocumentId existingChat = contactRepository.getContactExchange(UserFactory.mary(), new User(guest)).orElseThrow().chatId();
        invite(UserFactory.mary(), "chat-new");

        service.establish(assertion(bob), Optional.of(invitation(bob)));

        assertThat(contactRepository.getContactExchange(UserFactory.mary(), new User(guest)).orElseThrow().chatId())
            .isEqualTo(existingChat);
        assertThat(contactRepository.getContactExchange(placeholder, UserFactory.mary())).isEmpty();
        assertThat(contactRepository.getContactExchange(UserFactory.mary(), placeholder)).isEmpty();
    }

    @Test
    @DisplayName("Renewing without the invitation gives the same guest id")
    void renews() {
        invite(UserFactory.mary(), "chat-1");
        UserId guest = service.establish(assertion(bob), Optional.of(invitation(bob))).userId();

        assertThat(service.establish(assertion(bob), Optional.empty()).userId()).isEqualTo(guest);
    }

    @Test
    @DisplayName("Renewing needs the mapping: a stranger does not get a new identity")
    void renewWithoutMapping() {
        assertThatThrownBy(() -> service.establish(assertion(bob), Optional.empty())).isInstanceOf(InvalidAssertion.class);
    }

    @Test
    @DisplayName("The invitation must be for the address the home server vouches for")
    void otherAddress() {
        invite(UserFactory.mary(), "chat-1");
        Email carol = new Email("carol-" + System.nanoTime() + "@gmail.com");

        assertThatThrownBy(() -> service.establish(assertion(carol), Optional.of(invitation(bob))))
            .isInstanceOf(InvalidAssertion.class);
        assertThat(foreignUserMappingService.find(HOME, carol)).isEmpty();
        assertThat(foreignUserMappingService.find(HOME, bob)).isEmpty();
    }

    @Test
    @DisplayName("Only an invitation token counts, no other token and no garbage")
    void wrongToken() {
        invite(UserFactory.mary(), "chat-1");
        Token login = tokenService.generateLoginToken(bob, TokenService.ONE_HOUR);

        assertThatThrownBy(() -> service.establish(assertion(bob), Optional.of(login))).isInstanceOf(InvalidAssertion.class);
        assertThatThrownBy(() -> service.establish(assertion(bob), Optional.of(new Token("garbage"))))
            .isInstanceOf(InvalidAssertion.class);
    }

    @Test
    @DisplayName("Without an invitation filed for the address nobody gets in")
    void noPlaceholder() {
        assertThatThrownBy(() -> service.establish(assertion(bob), Optional.of(invitation(bob))))
            .isInstanceOf(InvalidAssertion.class);
    }

    @Test
    @DisplayName("An address with a local account logs in locally, not as a guest")
    void localAccount() {
        Email mary = UserFactory.MARY_EMAIL;

        assertThatThrownBy(() -> service.establish(assertion(mary), Optional.of(invitation(mary))))
            .isInstanceOf(InvalidAssertion.class);
        assertThat(foreignUserMappingService.find(HOME, mary)).isEmpty();
    }

    private VerifiedAssertion assertion(Email address) {
        return new VerifiedAssertion(HOME, address, "jti-" + System.nanoTime(), Instant.now().plusSeconds(60));
    }

    private Token invitation(Email address) {
        return tokenService.generateInvitationToken(address, TokenService.ONE_WEEK);
    }

    // What ContactService.invite files for an address that is not registered: an INVITED exchange with the placeholder id.
    private User invite(User inviter, String chat) {
        User placeholder = new User(userMappingService.registerUser(bob));
        contactRepository.persist(new ContactExchange(
            inviter, placeholder, INVITED, null, new DocumentId(chat + "-" + System.nanoTime()), null, null, null));
        return placeholder;
    }
}
