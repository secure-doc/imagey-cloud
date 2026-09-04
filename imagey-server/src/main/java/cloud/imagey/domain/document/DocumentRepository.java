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
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.Jsonb;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.document.AccessPath.Hop;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.StoredKeyFile;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.ResourceConflictException;
import cloud.imagey.infrastructure.common.KeyFileCrypto;

@ApplicationScoped
public class DocumentRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(DocumentRepository.class);
    private static final String KEY_FILE_SUFFIX = ".json";

    @Inject
    private Jsonb jsonb;

    @Inject
    private KeyFileCrypto keyFileCrypto;

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

    /**
     * The wrapped key for {@code (documentId, kid)} in {@code user}'s tree, located directly by its
     * hashed file name (ADR 0009). Only the ciphertext comes back - {@code issuer} / {@code kid} are
     * not stored.
     */
    public Optional<WrappedKey> findDocumentKey(User user, DocumentId documentId, Kid kid) {
        File keyFile = new File(keysFolder(user, documentId), keyFileCrypto.fileName(documentId.id(), kid.id()));
        return readStoredKeyFile(keyFile).map(stored -> new WrappedKey(stored.sharedKey()));
    }

    /**
     * Files a wrapped key. On disk it becomes a {@link StoredKeyFile} - a per-file random {@code
     * salt}, a one-way {@code witness} over {@code (issuer, kid)}, and the unchanged ciphertext -
     * at the edge-unique name {@code KeyFileCrypto#fileName(documentId, kid)}.
     *
     * <p>Write-once (ADR 0004): if the slot is already taken, only the {@code sharedKey} field is
     * compared (the {@code salt} / {@code witness} differ on every write) - an identical ciphertext
     * is a no-op, a different one is a 409.
     */
    public void create(User user, DocumentId documentId, EncryptedSharedKey sharedKey) {
        byte[] salt = keyFileCrypto.randomSalt();
        String witness = keyFileCrypto.witness(salt, sharedKey.issuer().id().id(), sharedKey.kid().id());
        StoredKeyFile stored = new StoredKeyFile(
            Base64.getEncoder().encodeToString(salt), witness, sharedKey.sharedKey());
        String fileName = keyFileCrypto.fileName(documentId.id(), sharedKey.kid().id());
        writeKeyFile(keysFolder(user, documentId), fileName, stored);
    }

    private void writeKeyFile(File folder, String fileName, StoredKeyFile stored) {
        if (!folder.exists()) {
            folder.mkdirs();
        }
        File file = new File(folder, fileName);
        if (file.exists()) {
            StoredKeyFile existing = readStoredKeyFile(file).orElse(null);
            if (existing != null && existing.sharedKey().equals(stored.sharedKey())) {
                return;
            }
            throw new ResourceConflictException(fileName + " already exists");
        }
        writeStringToFile(file, jsonb.toJson(stored));
    }

    /**
     * A <em>direct</em> grant for {@code caller} on {@code doc} in {@code owner}'s tree: a key file
     * whose {@code witness} matches the self-referential {@code (caller, caller)} pair. Every direct
     * share is filed that way - folder / chat shares (issuer == kid == grantee) and the server-synced
     * chat key alike - so this needs no client input.
     */
    public boolean hasDirectGrant(User owner, DocumentId doc, User caller) {
        return anyWitnessMatches(owner, doc, caller.id().id(), caller.id().id());
    }

    /**
     * Verifies that {@code caller} may read {@code urlDoc} in {@code urlOwner}'s tree.
     *
     * <ol>
     *   <li>a direct grant on the document itself -&gt; allowed;</li>
     *   <li>otherwise {@code path} is required: {@code path.hops[0]} must name {@code (urlDoc,
     *       urlOwner)}, each adjacent pair must be linked by a stored witness
     *       ({@code hops[i]}'s key, in {@code hops[i].owner}'s tree, wrapped by
     *       {@code (hops[i+1].owner, hops[i+1].doc)}) with a matching {@code wrappedBy}, and some hop
     *       past the first must terminate for {@code caller} - a direct grant on it, or
     *       {@code caller} being that hop's owner (the document was contributed to the caller's own
     *       folder).</li>
     * </ol>
     * A well-formed chain that never reaches a terminus -&gt; denied. The asserted {@code owner} of
     * every hop past the first is pinned by the previous hop's stored witness, so a caller cannot
     * forge a hop into a tree it has no key wrapping into.
     *
     * <p>A hop whose {@code doc} equals its own {@code owner}'s userId names that owner's settings
     * document, not a real child of the chain - the same slot a direct grant's witness is filed
     * under (see {@link #hasDirectGrant}). Its owner can plant an arbitrary witness there for
     * anyone, so such a hop may only close the chain via the trivial "caller owns it" case, and
     * must never be used as a stepping stone to a further hop (mirrors the old
     * {@code isIssuerInKeyChain}'s "kid == issuer's own id" guard).
     */
    public boolean verifyAccess(User urlOwner, DocumentId urlDoc, User caller, AccessPath path) {
        if (hasDirectGrant(urlOwner, urlDoc, caller)) {
            return true;
        }
        if (path == null || path.hops().isEmpty()) {
            return false;
        }
        List<Hop> hops = path.hops();
        Hop first = hops.get(0);
        if (!first.doc().equals(urlDoc) || !first.owner().equals(urlOwner)) {
            return false;
        }
        for (int i = 0; i < hops.size() - 1; i++) {
            Hop current = hops.get(i);
            Hop next = hops.get(i + 1);
            if (!isLinkedByWitness(current, next)) {
                return false;
            }
            if (isTerminus(next, caller)) {
                return true;
            }
            if (isOwnSettingsDocument(next)) {
                return false;
            }
        }
        return false;
    }

    private boolean isLinkedByWitness(Hop current, Hop next) {
        return current.wrappedBy().equals(next.doc())
            && anyWitnessMatches(current.owner(), current.doc(), next.owner().id().id(), next.doc().id());
    }

    private boolean isTerminus(Hop hop, User caller) {
        if (isOwnSettingsDocument(hop)) {
            return hop.owner().equals(caller);
        }
        return hop.owner().equals(caller) || hasDirectGrant(hop.owner(), hop.doc(), caller);
    }

    private boolean isOwnSettingsDocument(Hop hop) {
        return hop.doc().id().equals(hop.owner().id().id());
    }

    private boolean anyWitnessMatches(User owner, DocumentId doc, String issuerId, String kidId) {
        File[] keyFiles = keysFolder(owner, doc).listFiles(file -> file.getName().endsWith(KEY_FILE_SUFFIX));
        if (keyFiles == null) {
            return false;
        }
        for (File keyFile : keyFiles) {
            StoredKeyFile stored = readStoredKeyFile(keyFile).orElse(null);
            if (stored == null) {
                continue;
            }
            byte[] salt;
            try {
                salt = Base64.getDecoder().decode(stored.salt());
            } catch (IllegalArgumentException e) {
                LOG.warn("Ignoring key file with a non-base64 salt {}", keyFile);
                continue;
            }
            if (keyFileCrypto.witnessMatches(stored.witness(), salt, issuerId, kidId)) {
                return true;
            }
        }
        return false;
    }

    private Optional<StoredKeyFile> readStoredKeyFile(File keyFile) {
        if (!keyFile.exists()) {
            return empty();
        }
        try {
            return of(jsonb.fromJson(readFileToString(keyFile), StoredKeyFile.class));
        } catch (RuntimeException e) {
            // A single half-written or legacy-format sibling key file must not turn the whole
            // witness folder scan into a 500 and lock every member out (see StoredKeyFile's
            // requireNonNull'd fields).
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
