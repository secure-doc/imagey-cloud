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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

public class MessageRepositoryTest {

    @TempDir
    Path rootPath;

    private MessageRepository repository;
    private User receiver;
    private User sender;

    @BeforeEach
    void setUp() throws Exception {
        repository = new MessageRepository();
        var field = MessageRepository.class.getDeclaredField("rootPath");
        field.setAccessible(true);
        field.set(repository, rootPath.toString());

        receiver = new User(new Email("receiver@example.com"));
        sender = new User(new Email("sender@example.com"));
    }

    @Test
    void testPersistAndFetch() throws IOException {
        Message msg1 = repository.persist(receiver, sender, new MessageContent("content1"));
        assertNotNull(msg1.id());
        assertEquals("content1", msg1.content().value());

        // Test creating when paths already exist
        Message msg2 = repository.persist(receiver, sender, new MessageContent("content2"));
        assertNotNull(msg2.id());

        List<Message> messages = repository.fetchMessages(receiver, sender, java.util.Optional.empty());
        assertEquals(2, messages.size());
        assertEquals(msg1.id(), messages.get(0).id());
        assertEquals(msg2.id(), messages.get(1).id());

        // Test sinceId
        List<Message> sinceMessages = repository.fetchMessages(receiver, sender, java.util.Optional.of(msg1.id()));
        assertEquals(1, sinceMessages.size());
        assertEquals(msg2.id(), sinceMessages.get(0).id());
    }

    @Test
    void testMessageIdCompareTo() {
        MessageId id1 = new MessageId("1");
        MessageId id2 = new MessageId("2");
        assertTrue(id1.compareTo(id2) < 0);
        assertTrue(id2.compareTo(id1) > 0);
        assertEquals(0, id1.compareTo(new MessageId("1")));
    }

    @Test
    void testFetchWhenFolderDoesNotExist() {
        List<Message> messages = repository.fetchMessages(receiver, sender, java.util.Optional.empty());
        assertTrue(messages.isEmpty());
    }

    @Test
    void testFetchWhenFilesAreNull() throws IOException {
        // Create the folder but not as a directory to force listFiles to return null
        File receiverHome = new File(rootPath.toFile(), receiver.email().address());
        File messagesHome = new File(receiverHome, "messages");
        File senderFolder = new File(messagesHome, sender.email().address());

        senderFolder.getParentFile().mkdirs();
        senderFolder.createNewFile();

        List<Message> messages = repository.fetchMessages(receiver, sender, java.util.Optional.empty());
        assertTrue(messages.isEmpty());
    }
}
