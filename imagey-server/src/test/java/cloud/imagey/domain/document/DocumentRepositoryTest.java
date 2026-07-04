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
package cloud.imagey.domain.document;

import static java.util.Optional.empty;
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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

@MonoMeecrowaveConfig
public class DocumentRepositoryTest {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    private DocumentRepository documentRepository;

    private User user;
    private DocumentId documentId;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new Email("test@example.com"));
        documentId = new DocumentId(UUID.randomUUID().toString());
    }

    @Test
    @DisplayName("persist metadata when folder already exists")
    void persistMetadataFolderExists() {
        File userHome = new File(rootPath, user.email().address());
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        documentFolder.mkdirs();

        EncryptedContent metadata = new EncryptedContent(new byte[]{1, 2, 3});
        documentRepository.persist(user, documentId, metadata);

        File metadataFile = new File(documentFolder, "metadata.enc");
        assertThat(metadataFile).exists();
    }

    @Test
    @DisplayName("persist content when files folder already exists")
    void persistContentFilesFolderExists() {
        File userHome = new File(rootPath, user.email().address());
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File filesFolder = new File(documentFolder, "files");
        filesFolder.mkdirs();

        EncryptedContent content = new EncryptedContent(new byte[]{4, 5, 6});
        FileName fileName = new FileName("test.txt");
        documentRepository.persist(user, documentId, fileName, content);

        File contentFile = new File(filesFolder, "test.txt");
        assertThat(contentFile).exists();
    }

    @Test
    @DisplayName("loadContent with non-existent contentId returns empty")
    void loadContentNonExistent() {
        Optional<EncryptedContent> content = documentRepository.loadContent(user, documentId, new DocumentId("missing"));
        assertThat(content).isEmpty();
    }

    @Test
    @DisplayName("getTimestamp with non-existent metadata returns empty")
    void getTimestampNonExistent() {
        Optional<Long> timestamp = documentRepository.getTimestamp(user, documentId);
        assertThat(timestamp).isEmpty();
    }

    @Test
    @DisplayName("findMetadata when documents folder does not exist returns empty list")
    void findMetadataNoDocumentsFolder() {
        List<DocumentMetadata> metadata = documentRepository.findMetadata(user, empty());
        assertThat(metadata).isEmpty();
    }

    @Test
    @DisplayName("findMetadata for specific document when metadata is missing returns empty")
    void findSpecificMetadataMissing() {
        File userHome = new File(rootPath, user.email().address());
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        documentFolder.mkdirs();

        Optional<DocumentMetadata> metadata = documentRepository.findMetadata(user, documentId, user.email(), empty());
        assertThat(metadata).isEmpty();
    }

    @Test
    @DisplayName("findDocumentKey when key does not exist returns empty")
    void findDocumentKeyNonExistent() {
        Optional<EncryptedSharedKey> key = documentRepository.findDocumentKey(user, documentId, new Email("friend@example.com"));
        assertThat(key).isEmpty();
    }

    @Test
    @DisplayName("persist shared key when keys folder already exists")
    void persistSharedKeyFolderExists() {
        Email friend = new Email("friend@example.com");
        File userHome = new File(rootPath, user.email().address());
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "keys");
        File sharedKeyFolder = new File(sharedKeysFolder, friend.address());
        sharedKeyFolder.mkdirs();

        EncryptedContent key = new EncryptedContent(new byte[]{7, 8, 9});
        documentRepository.persist(user, documentId, friend, key);

        File keyFile = new File(sharedKeyFolder, "encrypted-shared.key");
        assertThat(keyFile).exists();
    }

    @Test
    @DisplayName("findDocumentKey with folderId sets issuerType to FOLDER")
    void findDocumentKeyWithFolderId() {
        User folderUser = new User(new Email("folder123"));
        Email lookupEmail = new Email("friend@example.com");

        // First, persist the key so it exists
        EncryptedContent key = new EncryptedContent(new byte[]{7, 8, 9});
        documentRepository.persist(folderUser, documentId, lookupEmail, key);

        Optional<EncryptedSharedKey> sharedKey = documentRepository.findDocumentKey(folderUser, documentId, lookupEmail);
        assertThat(sharedKey).isPresent();
        assertThat(sharedKey.get().issuerType()).isEqualTo("USER");
        assertThat(sharedKey.get().issuer()).isEqualTo("friend@example.com");
    }
}
