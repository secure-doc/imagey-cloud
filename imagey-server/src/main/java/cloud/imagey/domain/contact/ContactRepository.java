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

import static cloud.imagey.domain.contact.ContactStatus.INVITED;
import static jakarta.json.bind.JsonbBuilder.create;
import static java.util.Collections.emptyList;
import static java.util.Optional.empty;
import static java.util.Optional.of;

import java.io.File;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.Jsonb;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class ContactRepository extends AbstractFileRepository {

    private static final Logger LOG = LogManager.getLogger(ContactRepository.class);

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public void persist(ContactExchange contactExchange) {
        File inviterRequests = new File(
            getUserHome(contactExchange.inviter()), "contact-requests");
        File inviteeRequests = new File(
            getUserHome(new User(contactExchange.invitee())), "contact-requests");
        String content = create().toJson(contactExchange);
        writeStringToFile(new File(inviterRequests, contactExchange.invitee().address() + ".json"), content);
        writeStringToFile(new File(inviteeRequests, contactExchange.inviter().email().address() + ".json"), content);
    }

    public List<ContactExchange> findContactRequests(User user) {
        File userHome = getUserHome(user);
        File contactRequests = new File(userHome, "contact-requests");
        if (!contactRequests.exists()) {
            return emptyList();
        }
        Jsonb jsonb = create();
        File[] contacts = contactRequests.listFiles();
        return Stream.of(contacts)
                .sorted()
                .map(file -> jsonb.fromJson(readFileToString(file), ContactExchange.class))
                .filter(exchange -> exchange.status() == INVITED)
                .toList();
    }

    public Optional<ContactExchange> getContactExchange(User user, User contact) {
        File userHome = getUserHome(user);
        File contactRequests = new File(userHome, "contact-requests");
        File exchangeFile = new File(contactRequests, contact.email().address() + ".json");
        if (!exchangeFile.exists()) {
            return empty();
        }
        return of(create().fromJson(readFileToString(exchangeFile), ContactExchange.class));
    }


    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}

