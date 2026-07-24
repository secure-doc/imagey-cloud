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

import static cloud.imagey.domain.chat.ContactStatus.INVITATION_RECEIVED;
import static java.nio.charset.Charset.defaultCharset;
import static java.util.Collections.emptyList;
import static java.util.Optional.empty;
import static java.util.Optional.of;

import java.io.File;
import java.nio.charset.Charset;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class ContactRepository extends AbstractFileRepository {

    private static final Logger LOG = LogManager.getLogger(ContactRepository.class);
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public void persist(User sender, User recipient, ContactStatus newStatus) {
        File contactRequests = new File(getUserHome(sender), "contact-requests");
        File recipientRequests = new File(contactRequests, recipient.email().address());
        writeStringToFile(new File(recipientRequests, "status.txt"), newStatus.name(), defaultCharset());
    }

    public void persist(User user, User contact, String documentId) {
        File userHome = getUserHome(user);
        File contactHome = new File(userHome, "contacts");
        File contactFolder = new File(contactHome, contact.email().address());
        contactFolder.mkdirs();
        File docIdFile = new File(contactFolder, "documentId.txt");
        writeStringToFile(docIdFile, documentId, UTF_8, false);

        // Delete any pending invitations since they are now a contact
        File requestDirectory = new File(new File(userHome, "contact-requests"), contact.email().address());
        if (requestDirectory.exists()) {
            deleteDirectory(requestDirectory);
        }

        File otherHome = getUserHome(contact);
        File otherContactHome = new File(otherHome, "contacts");
        File otherContactFolder = new File(otherContactHome, user.email().address());
        otherContactFolder.mkdirs();
        File otherDocIdFile = new File(otherContactFolder, "documentId.txt");
        writeStringToFile(otherDocIdFile, documentId, UTF_8, false);

        File otherRequestDirectory = new File(new File(otherHome, "contact-requests"), user.email().address());
        if (otherRequestDirectory.exists()) {
            deleteDirectory(otherRequestDirectory);
        }
    }

    public List<User> findContactRequests(User user) {
        File userHome = getUserHome(user);
        File contactRequests = new File(userHome, "contact-requests");
        if (!contactRequests.exists()) {
            return emptyList();
        }
        File[] contacts = contactRequests.listFiles();
        return Stream.of(contacts)
                .filter(File::isDirectory)
                .sorted()
                .filter(directory -> readStatus(new File(directory, "status.txt")) == INVITATION_RECEIVED)
                .map(file -> new User(new Email(file.getName())))
                .toList();
    }

    public Optional<ContactStatus> getContactStatus(User user, User contact) {
        File userHome = getUserHome(user);
        File contactFolder = new File(new File(userHome, "contact-requests"), contact.email().address());
        File statusFile = new File(contactFolder, "status.txt");
        if (!statusFile.exists()) {
            return empty();
        }
        return of(readStatus(statusFile));
    }



    public boolean isContact(User user, User contact) {
        File userHome = getUserHome(user);
        File contactsHome = new File(userHome, "contacts");
        return new File(contactsHome, contact.email().address()).exists();
    }

    public List<String> findContacts(User user) {
        File userHome = getUserHome(user);
        File contactsHome = new File(userHome, "contacts");
        if (!contactsHome.exists() || !contactsHome.isDirectory()) {
            LOG.info("findContacts: contactsHome does not exist or is not directory: " + contactsHome.getAbsolutePath());
            return emptyList();
        }
        File[] files = contactsHome.listFiles();
        LOG.info("findContacts: contactsHome files: " + (files != null ? files.length : "null"));
        if (files == null) {
            return emptyList();
        }
        return Stream.of(files)
                .filter(File::isDirectory)
                .map(File::getName)
                .sorted()
                .toList();
    }

    private ContactStatus readStatus(File statusFile) {
        return ContactStatus.valueOf(readFileToString(statusFile));
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}
