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

import static java.util.Collections.emptyList;
import static org.apache.commons.io.FileUtils.write;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.List;
import java.util.stream.Stream;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class ContactRepository {

    private static final Logger LOG = LogManager.getLogger(ContactRepository.class);
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public void persist(User sender, User recipient, ContactStatus status) throws IOException {
        File userHome = getUserHome(sender);
        File contactHome;
        if (status == ContactStatus.INVITATION_SENT) {
            contactHome = new File(new File(userHome, "invitations"), "outgoing");
        } else if (status == ContactStatus.INVITATION_RECEIVED) {
            contactHome = new File(new File(userHome, "invitations"), "incoming");
        } else {
            // For declined status, we just remove the invitation folders
            File incoming = new File(new File(new File(userHome, "invitations"), "incoming"), recipient.email().address());
            if (incoming.exists()) {
                deleteDirectory(incoming);
            }
            File outgoing = new File(new File(new File(userHome, "invitations"), "outgoing"), recipient.email().address());
            if (outgoing.exists()) {
                deleteDirectory(outgoing);
            }
            return;
        }

        if (!contactHome.exists()) {
            contactHome.mkdirs();
        }
        File contactFolder = new File(contactHome, recipient.email().address());
        if (!contactFolder.exists()) {
            mkdir(contactFolder);
        }
        File statusFile = new File(contactFolder, "status.json");
        write(statusFile, """
                {
                    "status": "%s"
                }
            """.formatted(status.name().toLowerCase()), UTF_8, false);
    }

    public void persist(User user, User contact, EncryptedSharedKey key) throws IOException {
        File userHome = getUserHome(user);
        File contactHome = new File(userHome, "contacts");
        if (!contactHome.exists()) {
            contactHome.mkdirs();
        }
        File contactFolder = new File(contactHome, contact.email().address());
        if (!contactFolder.exists()) {
            mkdir(contactFolder);
        }
        File keyFile = new File(contactFolder, "key.enc");
        write(keyFile, key.key(), UTF_8, false);

        // Delete any pending invitations since they are now a contact
        File incoming = new File(new File(new File(userHome, "invitations"), "incoming"), contact.email().address());
        if (incoming.exists()) {
            deleteDirectory(incoming);
        }
        File outgoing = new File(new File(new File(userHome, "invitations"), "outgoing"), contact.email().address());
        if (outgoing.exists()) {
            deleteDirectory(outgoing);
        }
    }

    public List<User> findContactRequests(User user) {
        File userHome = getUserHome(user);
        File incomingHome = new File(new File(userHome, "invitations"), "incoming");
        if (!incomingHome.exists()) {
            return emptyList();
        }
        File[] contacts = incomingHome.listFiles();
        if (contacts == null) {
            return emptyList();
        }
        return Stream.of(contacts)
                .filter(File::isDirectory)
                .sorted()
                .map(file -> new User(new Email(file.getName())))
                .toList();
    }

    public List<User> findContacts(User user) {
        File userHome = getUserHome(user);
        File contactsHome = new File(userHome, "contacts");
        if (!contactsHome.exists() || !contactsHome.isDirectory()) {
            return emptyList();
        }
        return Stream.of(contactsHome.listFiles())
                .filter(File::isDirectory)
                .sorted()
                .map(file -> new User(new Email(file.getName())))
                .toList();
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }

    private void mkdir(File folder) {
        if (folder.exists()) {
            throw new ResourceConflictException(folder + " already exists");
        }
        if (!folder.mkdirs()) {
            LOG.info("Could not create folder " + folder.getName());
            throw new ResourceConflictException(folder + " could not be created");
        }
    }

    private void deleteDirectory(File f) throws IOException {
        if (f.isDirectory()) {
            for (File c : f.listFiles()) {
                deleteDirectory(c);
            }
        }
        if (!f.delete()) {
            throw new IOException("Failed to delete file: " + f);
        }
    }
}
