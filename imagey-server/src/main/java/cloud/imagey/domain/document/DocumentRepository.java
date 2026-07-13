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

import static java.util.Base64.getEncoder;
import static java.util.Collections.emptyList;
import static java.util.Optional.empty;
import static java.util.Optional.of;
import static org.apache.commons.io.FileUtils.readFileToByteArray;
import static org.apache.commons.io.FileUtils.writeByteArrayToFile;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.Base64Content;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.IoProblemException;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class DocumentRepository extends AbstractFileRepository {

    private static final Logger LOG = LogManager.getLogger(DocumentRepository.class);

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @PostConstruct
    public void logRootPath() {
        LOG.info("root.path = {}", rootPath);
    }

    public DocumentId persist(User user, EncryptedContent metadata) throws IOException {
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        persist(user, documentId, metadata);
        return documentId;
    }

    public void persist(User user, DocumentId documentId, EncryptedContent metadata) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        if (!documentFolder.exists()) {
            mkdir(documentFolder);
        }
        File documentMetadataFile = new File(documentFolder, "metadata.enc");
        writeByteArrayToFile(documentMetadataFile, metadata.content());
    }

    public void persist(User user, DocumentId documentId, FileName fileName, EncryptedContent content) {
        try {
            File userHome = getUserHome(user);
            File documentHome = new File(userHome, "documents");
            File documentFolder = new File(documentHome, documentId.id());
            File contentsFolder = new File(documentFolder, "files");
            if (!contentsFolder.exists()) {
                mkdir(contentsFolder);
            }
            File contentFile = new File(contentsFolder, fileName.name());
            writeByteArrayToFile(contentFile, content.content());
        } catch (IOException e) {
            throw new IoProblemException(e);
        }
    }

    public Optional<EncryptedContent> loadContent(User user, DocumentId documentId, DocumentId contentId) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File contentsFolder = new File(documentFolder, "files");
        File contentFile = new File(contentsFolder, contentId.id());
        if (!contentFile.exists()) {
            return empty();
        }
        return of(new EncryptedContent(readFileToByteArray(contentFile)));
    }

    public List<DocumentMetadata> findMetadata(User user) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        if (!documentHome.exists()) {
            return emptyList();
        }
        return Stream.of(documentHome.list())
            .filter(name -> new File(documentHome, name).isDirectory())
            .sorted()
            .map(DocumentId::new)
            .map(id -> findMetadata(user, id, user.email()))
            .toList();
    }

    public DocumentMetadata findMetadata(User user, DocumentId documentId, Email callerEmail) {
        EncryptedSharedKey sharedKey = findDocumentKey(user, documentId, callerEmail).orElse(null);
        return new DocumentMetadata(documentId, loadDocumentMetadata(user, documentId), sharedKey);
    }

    private Base64Content loadDocumentMetadata(User user, DocumentId documentId) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File metadataFile = new File(documentFolder, "metadata.enc");
        try {
            getEncoder().encodeToString(readFileToByteArray(metadataFile));
            return new Base64Content(getEncoder().encodeToString(readFileToByteArray(metadataFile)));
        } catch (IOException e) {
            throw new IoProblemException(e);
        }
    }

    public Optional<EncryptedSharedKey> findDocumentKey(User user, DocumentId documentId, Email userTheDocumentIsSharedWith) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "keys");
        File sharedKeyFolder = new File(sharedKeysFolder, userTheDocumentIsSharedWith.address());
        File sharedKey = new File(sharedKeyFolder, "encrypted-shared.key");
        if (!sharedKey.exists()) {
            return empty();
        }
        try {
            String encodedKey = getEncoder().encodeToString(readFileToByteArray(sharedKey));
            return of(new EncryptedSharedKey(user.email().address(), "0", encodedKey));
        } catch (IOException e) {
            throw new IoProblemException(e);
        }
    }

    public void persist(User user, DocumentId documentId, Email userTheDocumentIsSharedWith, EncryptedContent key) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "keys");
        File sharedKeyFolder = new File(sharedKeysFolder, userTheDocumentIsSharedWith.address());
        if (!sharedKeyFolder.exists()) {
            mkdir(sharedKeyFolder);
        }
        File sharedKeyFile = new File(sharedKeyFolder, "encrypted-shared.key");
        writeByteArrayToFile(sharedKeyFile, key.content());
    }

    public boolean hasSharedKey(User user, DocumentId documentId, Email userTheDocumentIsSharedWith) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "keys");
        File sharedKeyFolder = new File(sharedKeysFolder, userTheDocumentIsSharedWith.address());
        File sharedKey = new File(sharedKeyFolder, "encrypted-shared.key");
        return sharedKey.exists();
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}
