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

import static java.util.Collections.emptyList;
import static java.util.Optional.empty;
import static java.util.Optional.of;
import static javax.json.bind.JsonbBuilder.create;
import static org.apache.commons.io.FileUtils.readFileToByteArray;
import static org.apache.commons.io.FileUtils.write;
import static org.apache.commons.io.FileUtils.writeByteArrayToFile;
import static org.apache.commons.io.FileUtils.writeStringToFile;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import javax.annotation.PostConstruct;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import org.apache.commons.io.FileUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.IoProblemException;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class DocumentRepository {

    private static final Logger LOG = LogManager.getLogger(DocumentRepository.class);
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @PostConstruct
    public void logRootPath() {
        LOG.info("root.path = {}", rootPath);
    }

    public void persist(User user, DocumentMetadata documentMetadata) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        if (!documentHome.exists()) {
            mkdir(documentHome);
        }
        File documentFolder = new File(documentHome, documentMetadata.documentId().id());
        if (!documentFolder.exists()) {
            mkdir(documentFolder);
        }
        File metadataFile = new File(documentFolder, "meta-data");
        write(metadataFile, create().toJson(documentMetadata), UTF_8, false);
    }

    public void persist(User user, DocumentId documentId, DocumentId contentId, DocumentContent content) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File contentsFolder = new File(documentFolder, "contents");
        if (!contentsFolder.exists()) {
            mkdir(contentsFolder);
        }
        File contentFile = new File(contentsFolder, contentId.id());
        writeByteArrayToFile(contentFile, content.content());
    }

    public Optional<DocumentContent> loadContent(User user, DocumentId documentId, DocumentId contentId) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File contentsFolder = new File(documentFolder, "contents");
        File contentFile = new File(contentsFolder, contentId.id());
        if (!contentFile.exists()) {
            return empty();
        }
        return of(new DocumentContent(readFileToByteArray(contentFile)));
    }

    public List<DocumentMetadata> findMetadata(User user) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        if (!documentHome.exists()) {
            return emptyList();
        }
        return Stream.of(documentHome.list())
            .sorted()
            .map(DocumentId::new)
            .map(id -> findMetadata(user, id))
            .toList();
    }

    public DocumentMetadata findMetadata(User user, DocumentId documentId) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File metadataFile = new File(documentFolder, "meta-data");
        return create().fromJson(readFileToString(metadataFile), DocumentMetadata.class);
    }

    public Optional<EncryptedSharedKey> findDocumentKey(User user, DocumentId documentId, Email userTheDocumentIsSharedWith) {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "shared-keys");
        File sharedKeyFolder = new File(sharedKeysFolder, userTheDocumentIsSharedWith.address());
        File sharedKey = new File(sharedKeyFolder, "encrypted-shared.key");
        if (!sharedKey.exists()) {
            return empty();
        }
        return of(new EncryptedSharedKey(readFileToString(sharedKey)));
    }

    public void persist(User user, DocumentId documentId, Email userTheDocumentIsSharedWith, EncryptedSharedKey key) throws IOException {
        File userHome = getUserHome(user);
        File documentHome = new File(userHome, "documents");
        File documentFolder = new File(documentHome, documentId.id());
        File sharedKeysFolder = new File(documentFolder, "shared-keys");
        File sharedKeyFolder = new File(sharedKeysFolder, userTheDocumentIsSharedWith.address());
        File sharedKey = new File(sharedKeyFolder, "encrypted-shared.key");
        if (sharedKey.exists()) {
            throw new ResourceConflictException(sharedKey + " already exists");
        }
        writeStringToFile(sharedKey, key.key(), UTF_8);
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

    private String readFileToString(File file) {
        try {
            return FileUtils.readFileToString(file, UTF_8);
        } catch (IOException e) {
            throw new IoProblemException(e.getMessage());
        }
    }
}
