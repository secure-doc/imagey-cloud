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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.Jsonb;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;

@ApplicationScoped
public class DocumentRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(DocumentRepository.class);
    private static final String KEY_FILE_SUFFIX = ".json";

    @Inject
    private Jsonb jsonb;

    public void persist(User user, DocumentId documentId, EncryptedContent metadata) {
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

    public boolean documentExists(User user, DocumentId documentId) {
        return metadataFile(user, documentId).exists();
    }

    /**
     * A strong validator for a document's current metadata: the hex-encoded SHA-256 of the stored
     * {@code metadata.enc} bytes. Unlike a file timestamp this has no clock-granularity blind spot -
     * any change to the content changes the tag - so it is safe to use for optimistic locking on
     * the folder update path (see {@link DocumentService#uploadDocument}).
     */
    public Optional<String> getETag(User user, DocumentId documentId) {
        return loadEncryptedMetadataWithETag(user, documentId).map(EncryptedMetadata::etag);
    }

    public Optional<EncryptedContent> loadEncryptedMetadata(User user, DocumentId documentId) {
        return loadEncryptedMetadataWithETag(user, documentId).map(EncryptedMetadata::content);
    }

    /**
     * The document's encrypted metadata together with its {@link #getETag ETag}, reading and hashing
     * {@code metadata.enc} <em>once</em>. Prefer this on paths that need both (the document GET, the
     * upload response) over separate {@link #loadEncryptedMetadata} + {@link #getETag} calls.
     */
    public Optional<EncryptedMetadata> loadEncryptedMetadataWithETag(User user, DocumentId documentId) {
        File metadataFile = metadataFile(user, documentId);
        if (!metadataFile.exists()) {
            return empty();
        }
        byte[] bytes = readFileToByteArray(metadataFile);
        return of(new EncryptedMetadata(new EncryptedContent(bytes), sha256Hex(bytes)));
    }

    /** The ETag {@code content} would have once stored (see {@link #getETag}) - no I/O. */
    public String etagOf(EncryptedContent content) {
        return sha256Hex(content.content());
    }

    private static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    public Optional<EncryptedSharedKey> findDocumentKey(User user, DocumentId documentId, Kid kid) {
        return readKey(new File(keysFolder(user, documentId), kid.id() + KEY_FILE_SUFFIX));
    }

    public void create(User user, DocumentId documentId, EncryptedSharedKey sharedKey) {
        createNewFileWithContent(
            keysFolder(user, documentId), sharedKey.kid().id() + KEY_FILE_SUFFIX, jsonb.toJson(sharedKey));
    }

    public boolean isIssuerInKeyChain(User owner, DocumentId documentId, User member) {
        return isIssuerInKeyChain(owner, documentId, member, new HashSet<>());
    }

    private boolean isIssuerInKeyChain(User owner, DocumentId documentId, User member, Set<String> visited) {
        if (!visited.add(owner.email().address() + "/" + documentId.id())) {
            return false;
        }
        File[] keyFiles = keysFolder(owner, documentId).listFiles(file -> file.getName().endsWith(KEY_FILE_SUFFIX));
        if (keyFiles == null) {
            return false;
        }
        for (File keyFile : keyFiles) {
            Optional<EncryptedSharedKey> key = readKey(keyFile);
            if (key.isEmpty()) {
                continue;
            }
            if (member.equals(key.get().issuer())) {
                return true;
            }
            User parentOwner = key.get().issuer();
            DocumentId parent = new DocumentId(key.get().kid().id());
            // A synced chat key is filed under kid = the issuer's own email (see
            // ContactService.confirmReceipt), which also happens to be the id of that user's
            // settings document. That is not a real parent of this document, so don't follow the
            // link into the issuer's settings tree - a third-party key later filed there must not
            // transitively grant access here.
            if (parent.id().equals(parentOwner.email().address())) {
                continue;
            }
            if (documentExists(parentOwner, parent)
                && isIssuerInKeyChain(parentOwner, parent, member, visited)) {
                return true;
            }
        }
        return false;
    }

    private Optional<EncryptedSharedKey> readKey(File keyFile) {
        if (!keyFile.exists()) {
            return empty();
        }
        try {
            return of(jsonb.fromJson(readFileToString(keyFile), EncryptedSharedKey.class));
        } catch (RuntimeException e) {
            // Not just JsonException: EncryptedSharedKey's compact constructor requireNonNull's its
            // fields and its @JsonbCreator builds an Email (IllegalArgumentException on a bad
            // address). A single half-written or legacy-format sibling key file must not turn the
            // whole isIssuerInKeyChain folder scan into a 500 and lock every member out.
            LOG.warn("Ignoring unreadable shared key file {}", keyFile, e);
            return empty();
        }
    }

    private File keysFolder(User user, DocumentId documentId) {
        return new File(documentFolder(user, documentId), "keys");
    }

    private File metadataFile(User user, DocumentId documentId) {
        return new File(documentFolder(user, documentId), "metadata.enc");
    }

    private File documentFolder(User user, DocumentId documentId) {
        return new File(new File(getUserHome(user), "documents"), documentId.id());
    }
}
