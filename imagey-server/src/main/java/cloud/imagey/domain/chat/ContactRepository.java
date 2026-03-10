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

import static org.apache.commons.io.FileUtils.write;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.List;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
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
        File contactHome = new File(userHome, "contacts");
        if (!contactHome.exists()) {
            mkdir(contactHome);
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
            mkdir(contactHome);
        }
        File contactFolder = new File(contactHome, contact.email().address());
        if (!contactFolder.exists()) {
            mkdir(contactFolder);
        }
        File keyFile = new File(contactFolder, "key.enc");
        write(keyFile, key.key(), UTF_8, false);
    }

    public List<User> findContactRequests(User user) {
        return null;
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
}
