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

import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

@MonoMeecrowaveConfig
public class MessageRepositoryTest {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    private MessageRepository messageRepository;

    private User user;
    private DocumentId documentId;

    @BeforeEach
    void setup() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new Email("test@example.com"));
        documentId = new DocumentId(UUID.randomUUID().toString());
    }

    @Test
    void testFetchMessagesWhenMessagesIsNotDirectory() throws IOException {
        File userHome = new File(rootPath, user.email().address());
        File documentsHome = new File(userHome, "documents");
        File documentFolder = new File(documentsHome, documentId.id());
        documentFolder.mkdirs();

        // Create a FILE named "messages" instead of a directory
        File messagesFile = new File(documentFolder, "messages");
        messagesFile.createNewFile();

        // This should hit the false branch of `messagesFolder.isDirectory()`
        List<Message> messages = messageRepository.fetchMessages(user, documentId, Optional.empty());
        assertThat(messages).isEmpty();
    }
}
