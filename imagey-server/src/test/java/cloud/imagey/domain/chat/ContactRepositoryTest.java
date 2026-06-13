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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

public class ContactRepositoryTest {

    @TempDir
    Path rootPath;

    private ContactRepository repository;
    private User sender;
    private User recipient;

    @BeforeEach
    void setUp() throws Exception {
        repository = new ContactRepository();
        var field = ContactRepository.class.getDeclaredField("rootPath");
        field.setAccessible(true);
        field.set(repository, rootPath.toString());

        sender = new User(new Email("sender@example.com"));
        recipient = new User(new Email("recipient@example.com"));
    }

    @Test
    void testPersistAndGetStatus() throws IOException {
        repository.persist(sender, recipient, ContactStatus.INVITATION_RECEIVED);

        Optional<ContactStatus> status = repository.getContactStatus(sender, recipient);
        assertTrue(status.isPresent());
        assertEquals(ContactStatus.INVITATION_RECEIVED, status.get());
    }

    @Test
    void testGetContactStatusWhenNotExists() {
        Optional<ContactStatus> status = repository.getContactStatus(sender, recipient);
        assertFalse(status.isPresent());
    }

    @Test
    void testPersistContactAndGetKey() throws IOException {
        EncryptedSharedKey key = new EncryptedSharedKey("my-secret-key");

        // Also simulate an existing request directory to cover the branch
        File requestDir = new File(
            new File(new File(rootPath.toFile(), sender.email().address()), "contact-requests"),
            recipient.email().address());
        requestDir.mkdirs();
        assertTrue(requestDir.exists());

        repository.persist(sender, recipient, key);

        // requestDir should be deleted
        assertFalse(requestDir.exists());

        Optional<ContactKeys> retrievedKey = repository.getContactKeys(sender, recipient);
        assertTrue(retrievedKey.isPresent());
        assertEquals("my-secret-key", retrievedKey.get().key().key());

        assertTrue(repository.isContact(sender, recipient));

        // Try persist again when directories already exist to hit those branches
        repository.persist(sender, recipient, key);
    }

    @Test
    void testGetContactKeyWhenNotExists() {
        Optional<ContactKeys> retrievedKey = repository.getContactKeys(sender, recipient);
        assertFalse(retrievedKey.isPresent());
        assertFalse(repository.isContact(sender, recipient));
    }

    @Test
    void testPersistInvitationKeyAndGetKey() throws IOException {
        cloud.imagey.domain.encryption.InvitationKey invitationKey = new cloud.imagey.domain.encryption.InvitationKey("inv-key");
        repository.persist(sender, recipient, invitationKey);
        Optional<ContactKeys> retrievedKey = repository.getContactKeys(sender, recipient);
        assertTrue(retrievedKey.isPresent());
        assertEquals("inv-key", retrievedKey.get().invitationKey().key());
    }

    @Test
    void testUpdateContactKey() throws IOException {
        cloud.imagey.domain.encryption.InvitationKey invitationKey = new cloud.imagey.domain.encryption.InvitationKey("inv-key");
        repository.persist(sender, recipient, invitationKey);
        EncryptedSharedKey updatedKey = new EncryptedSharedKey("updated-secret");
        repository.updateContactKey(sender, recipient, updatedKey);
        Optional<ContactKeys> retrievedKey = repository.getContactKeys(sender, recipient);
        assertTrue(retrievedKey.isPresent());
        assertEquals("updated-secret", retrievedKey.get().key().key());
    }

    @Test
    void testFindContactRequests() throws IOException {
        // No contact requests initially
        List<User> requests = repository.findContactRequests(sender);
        assertTrue(requests.isEmpty());

        repository.persist(sender, recipient, ContactStatus.INVITATION_RECEIVED);

        requests = repository.findContactRequests(sender);
        assertEquals(1, requests.size());
        assertEquals(recipient.email().address(), requests.get(0).email().address());
    }

    @Test
    void testFindContacts() throws IOException {
        List<User> contacts = repository.findContacts(sender);
        assertTrue(contacts.isEmpty());

        // Make it a file instead of directory to test isDirectory() condition
        File contactsHome = new File(new File(rootPath.toFile(), sender.email().address()), "contacts");
        contactsHome.getParentFile().mkdirs();
        contactsHome.createNewFile();

        contacts = repository.findContacts(sender);
        assertTrue(contacts.isEmpty());

        contactsHome.delete();

        repository.persist(sender, recipient, new EncryptedSharedKey("key"));

        contacts = repository.findContacts(sender);
        assertEquals(1, contacts.size());
        assertEquals(recipient.email().address(), contacts.get(0).email().address());
    }
}
