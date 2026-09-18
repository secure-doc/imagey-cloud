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

import static java.util.Optional.empty;
import static java.util.Optional.of;

import java.util.List;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.Jsonb;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.user.User;

@ApplicationScoped
public class ContactRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(ContactRepository.class);
    private static final String CONTACT_REQUESTS = "contact-requests";

    @Inject
    private Jsonb jsonb;

    public void persist(ContactExchange contactExchange) {
        String content = jsonb.toJson(contactExchange);
        put(join(getUserPrefix(contactExchange.inviter()), CONTACT_REQUESTS, contactExchange.invitee().id().id() + ".json"),
            content);
        put(join(getUserPrefix(contactExchange.invitee()), CONTACT_REQUESTS, contactExchange.inviter().id().id() + ".json"),
            content);
    }

    public List<ContactExchange> findContactRequests(User user) {
        String prefix = join(getUserPrefix(user), CONTACT_REQUESTS);
        return list(prefix).keys().stream()
                .filter(key -> key.endsWith(".json"))
                .sorted()
                .map(this::parseExchange)
                .filter(exchange -> exchange != null)
                .filter(exchange -> isActionableFor(user, exchange))
                .toList();
    }

    // A leftover directory, an old-format status file or a half-written entry must not turn the
    // whole listing into a 500 and block the contacts UI - skip and log the offending entry.
    private ContactExchange parseExchange(String key) {
        try {
            return jsonb.fromJson(readString(key), ContactExchange.class);
        } catch (RuntimeException e) {
            LOG.warn("Ignoring unparseable contact-request entry {}", key, e);
            return null;
        }
    }

    // "Actionable" mirrors the two sides of the handshake: an invitee sees invitations still
    // waiting on THEM to accept/decline, while an inviter - once the invitee has accepted - sees
    // the (still unconfirmed) acceptance so their client can pick up the shared chat key and
    // confirm receipt (see ContactService.acceptInvitation/confirmReceipt). RECEIVED/DENIED
    // exchanges are done and no longer show up for either side.
    private boolean isActionableFor(User user, ContactExchange exchange) {
        return switch (exchange.status()) {
            case INVITED -> exchange.invitee().equals(user);
            case ACCEPTED -> exchange.inviter().equals(user);
            default -> false;
        };
    }

    public Optional<ContactExchange> getContactExchange(User user, User contact) {
        String key = join(getUserPrefix(user), CONTACT_REQUESTS, contact.id().id() + ".json");
        Optional<String> content = findString(key);
        if (content.isEmpty()) {
            return empty();
        }
        try {
            return of(jsonb.fromJson(content.get(), ContactExchange.class));
        } catch (RuntimeException e) {
            // A half-written or legacy-format exchange file must not 500 invite / acceptInvitation /
            // declineInvitation / confirmReceipt - treat it as "no exchange" (same hardening as
            // parseExchange applies to the listing).
            LOG.warn("Ignoring unparseable contact-request entry {}", key, e);
            return empty();
        }
    }
}
