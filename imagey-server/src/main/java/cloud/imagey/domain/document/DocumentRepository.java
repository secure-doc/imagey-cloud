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
import static java.util.Optional.of;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.util.Optional;
import java.util.UUID;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.IoProblemException;
import cloud.imagey.infrastructure.ResourceConflictException;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class DocumentRepository extends AbstractFileRepository {

    private static final Logger LOG = LogManager.getLogger(DocumentRepository.class);

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private Jsonb jsonb;

    @PostConstruct
    public void logRootPath() {
        LOG.info("root.path = {}", rootPath);
    }

    public void create(User user, Document document) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, document.documentId().id());
        if (documentFolder.exists()) {
            throw new ResourceConflictException("Cannot create document, because it already exists");
        }
        mkdir(documentFolder);
        File documentFile = new File(documentFolder, "document.enc");
        writeByteArrayToFile(documentFile, document.content().content());
        File keysFolder = new File(documentFolder, "keys");
        mkdir(keysFolder);
        File keyFile = new File(keysFolder, document.sharedKey().kid().id() + ".json");
        writeStringToFile(keyFile, jsonb.toJson(document.sharedKey()));
    }

    public void update(User user, DocumentId documentId, EncryptedContent content) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        if (!documentFolder.exists()) {
            throw new ResourceConflictException("Cannot update document, because it does not exists");
        }
        File documentFile = new File(documentFolder, "document.enc");
        writeByteArrayToFile(documentFile, content.content());
    }

    public DocumentId persist(User user, EncryptedContent metadata) {
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        persist(user, documentId, metadata);
        return documentId;
    }

    public void persist(User user, DocumentId documentId, EncryptedContent metadata) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        if (!documentFolder.exists()) {
            mkdir(documentFolder);
        }
        File documentMetadataFile = new File(documentFolder, "document.enc");
        writeByteArrayToFile(documentMetadataFile, metadata.content());
    }

    public void addContent(User user, DocumentId documentId, FileName fileName, EncryptedContent content) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File contentsFolder = new File(documentFolder, "files");
        if (!contentsFolder.exists()) {
            mkdir(contentsFolder);
        }
        File contentFile = new File(contentsFolder, fileName.name());
        writeByteArrayToFile(contentFile, content.content());
    }

    public Optional<EncryptedContent> loadContent(User user, DocumentId documentId, DocumentId contentId) {
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


    public Optional<Long> getTimestamp(User user, DocumentId documentId) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File metadataFile = new File(documentFolder, "document.enc");
        if (!metadataFile.exists()) {
            return empty();
        }
        return of(metadataFile.lastModified());
    }

    public Optional<EncryptedContent> findDocument(User user, DocumentId documentId) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File documentFile = new File(documentFolder, "document.enc");
        return of(documentFile).filter(File::exists).map(super::readFileToByteArray).map(EncryptedContent::new);
    }

    public Optional<EncryptedSharedKey> findDocumentKey(User user, DocumentId documentId, Kid kid) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "keys");
        File sharedKey = new File(sharedKeysFolder, kid.id() + ".json");
        if (!sharedKey.exists()) {
            return empty();
        }
        try {
            return of(jsonb.fromJson(new FileReader(sharedKey), EncryptedSharedKey.class));
        } catch (JsonbException e) {
            throw new IoProblemException(e);
        } catch (FileNotFoundException e) {
            throw new IoProblemException(e);
        }
    }

    public void persist(User user, DocumentId documentId, Email userTheDocumentIsSharedWith, EncryptedContent key) {
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
