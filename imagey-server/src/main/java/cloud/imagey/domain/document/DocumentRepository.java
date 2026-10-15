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

import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import cloud.imagey.infrastructure.common.Sha256;

@ApplicationScoped
public class DocumentRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(DocumentRepository.class);
    private static final String KEY_FILE_SUFFIX = ".json";

    @Inject
    private Jsonb jsonb;

    @Inject
    private KeyFileCrypto keyFileCrypto;

    public void persist(User user, DocumentId documentId, EncryptedContent metadata) {
        put(metadataFile(user, documentId), metadata.content());
    }

    public void persist(User user, DocumentId documentId, FileName fileName, EncryptedContent content) {
        put(join(documentFolder(user, documentId), "files", fileName.name()), content.content());
    }

    public Optional<EncryptedContent> loadContent(User user, DocumentId documentId, DocumentId contentId) {
        return find(join(documentFolder(user, documentId), "files", contentId.id())).map(EncryptedContent::new);
    }

    public boolean documentExists(User user, DocumentId documentId) {
        return exists(metadataFile(user, documentId));
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
     * The document's encrypted metadata together with its {@link #getETag ETag} and backend version,
     * reading {@code metadata.enc} <em>once</em>. Prefer this on paths that need more than one of
     * these (the document GET, the upload response, the folder-update CAS in
     * {@link DocumentService#uploadDocument}) over separate {@link #loadEncryptedMetadata} +
     * {@link #getETag} calls.
     */
    public Optional<EncryptedMetadata> loadEncryptedMetadataWithETag(User user, DocumentId documentId) {
        return get(metadataFile(user, documentId))
            .map(stored -> new EncryptedMetadata(
                new EncryptedContent(stored.content()), Sha256.hex(stored.content()), stored.version()));
    }

    /** The ETag {@code content} would have once stored (see {@link #getETag}) - no I/O. */
    public String etagOf(EncryptedContent content) {
        return Sha256.hex(content.content());
    }

    /**
     * Replaces a document's {@code metadata.enc}, but only if it is still at {@code expectedVersion} -
     * from a prior {@link #loadEncryptedMetadataWithETag}. The guard against two concurrent writers to
     * the same {@code metadata.enc} clobbering each other, safe across JVM instances (ADR 0011) - a
     * folder document is not distinguished from any other, so this is used both for the folder-content
     * write in {@link DocumentService#uploadDocument} and for a direct metadata update
     * ({@code DocumentResource#updateDocument}), which can target the very same key.
     *
     * @return {@code true} if the write happened, {@code false} if the document changed since it was read
     */
    public boolean persistIfCurrent(User owner, DocumentId documentId, EncryptedContent content, String expectedVersion) {
        return putIfVersionMatches(metadataFile(owner, documentId), content.content(), expectedVersion);
    }

    /**
     * Lets {@code grantee} add documents to the shared folder {@code documentId} - and, since an
     * Access-Path proves the target lies below it, to everything below it (see {@link
     * DocumentService#uploadDocument}). The right is the owner's decision per (folder, recipient):
     * an empty plaintext object under the same hashed name as the recipient's key file, so it
     * reveals no edge the key file does not reveal (ADR 0009) and changes neither {@code
     * metadata.enc} nor its ETag. Idempotent.
     */
    public void allowContributions(User owner, DocumentId documentId, User grantee) {
        put(contributionsMarker(owner, documentId, grantee), new byte[0]);
    }

    /** Takes the right away for <em>new</em> contributions; contributions already made stay. */
    public void denyContributions(User owner, DocumentId documentId, User grantee) {
        delete(contributionsMarker(owner, documentId, grantee));
    }

    public boolean allowsContributions(User owner, DocumentId documentId, User grantee) {
        return exists(contributionsMarker(owner, documentId, grantee));
    }

    /**
     * The wrapped key for {@code (documentId, kid)} in {@code user}'s tree, located directly by its
     * hashed file name (ADR 0009). Only the ciphertext comes back - {@code issuer} / {@code kid} are
     * not stored.
     */
    public Optional<WrappedKey> findDocumentKey(User user, DocumentId documentId, Kid kid) {
        String key = join(keysFolder(user, documentId), keyFileCrypto.fileName(documentId.id(), kid.id()));
        return readStoredKeyFile(key).map(stored -> new WrappedKey(stored.sharedKey()));
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

    private void writeKeyFile(String folder, String fileName, StoredKeyFile stored) {
        String key = join(folder, fileName);
        if (!putIfAbsent(key, jsonb.toJson(stored).getBytes(UTF_8))) {
            StoredKeyFile existing = readStoredKeyFile(key).orElse(null);
            if (existing == null || !existing.sharedKey().equals(stored.sharedKey())) {
                throw new ResourceConflictException(fileName + " already exists");
            }
        }
    }

    /**
     * A <em>direct</em> grant for {@code caller} on {@code doc} in {@code owner}'s tree: a key file
     * whose {@code witness} matches the self-referential {@code (caller, caller)} pair. Every direct
     * share is filed that way - folder / chat shares (issuer == kid == grantee) and the server-synced
     * chat key alike - so this needs no client input.
     */
    public boolean hasDirectGrant(User owner, DocumentId doc, User caller) {
        return hasDirectGrant(owner, doc, caller, new HashMap<>());
    }

    private boolean hasDirectGrant(User owner, DocumentId doc, User caller, Map<String, List<Witness>> cache) {
        return anyWitnessMatches(owner, doc, caller.id().id(), caller.id().id(), cache);
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
        return !walk(urlOwner, urlDoc, caller, path, true).isEmpty();
    }

    /**
     * Every hop of the proof that terminates for {@code caller}, in chain order: the document itself
     * for a direct grant, and each hop past the first that is a direct grant for {@code caller} or
     * one {@code caller} owns. That is where the owner's decisions about {@code caller} sit - the
     * shared folders {@code caller} holds a direct grant on, or folders of {@code caller}'s own tree.
     * A shared folder deeper down must not hide the one above it, so the chain is followed to its
     * end (each link is pinned by a stored witness, like for {@link #verifyAccess}).
     */
    public List<Hop> findTermini(User urlOwner, DocumentId urlDoc, User caller, AccessPath path) {
        return walk(urlOwner, urlDoc, caller, path, false);
    }

    private List<Hop> walk(User urlOwner, DocumentId urlDoc, User caller, AccessPath path, boolean firstOnly) {
        List<Hop> termini = new ArrayList<>();
        // The key files of a folder are read once for the whole proof: every hop asks two questions
        // of the same folder (linked to the previous hop? a direct grant for the caller?).
        Map<String, List<Witness>> cache = new HashMap<>();
        if (hasDirectGrant(urlOwner, urlDoc, caller, cache)) {
            termini.add(new Hop(urlDoc, urlOwner, urlDoc));
        }
        if (firstOnly && !termini.isEmpty()) {
            return termini;
        }
        if (path != null && startsAt(path, urlOwner, urlDoc)) {
            followChain(path.hops(), caller, firstOnly, termini, cache);
        }
        return termini;
    }

    private static boolean startsAt(AccessPath path, User urlOwner, DocumentId urlDoc) {
        return !path.hops().isEmpty()
            && path.hops().get(0).doc().equals(urlDoc)
            && path.hops().get(0).owner().equals(urlOwner);
    }

    private void followChain(
        List<Hop> hops, User caller, boolean firstOnly, List<Hop> termini, Map<String, List<Witness>> cache) {
        for (int i = 0; i < hops.size() - 1; i++) {
            Hop next = hops.get(i + 1);
            if (!isLinkedByWitness(hops.get(i), next, cache)) {
                return;
            }
            if (isTerminus(next, caller, cache)) {
                termini.add(next);
                if (firstOnly) {
                    return;
                }
            }
            if (isOwnSettingsDocument(next)) {
                return;
            }
        }
    }

    private boolean isLinkedByWitness(Hop current, Hop next, Map<String, List<Witness>> cache) {
        return current.wrappedBy().equals(next.doc())
            && anyWitnessMatches(current.owner(), current.doc(), next.owner().id().id(), next.doc().id(), cache);
    }

    private boolean isTerminus(Hop hop, User caller, Map<String, List<Witness>> cache) {
        if (isOwnSettingsDocument(hop)) {
            return hop.owner().equals(caller);
        }
        return hop.owner().equals(caller) || hasDirectGrant(hop.owner(), hop.doc(), caller, cache);
    }

    private boolean isOwnSettingsDocument(Hop hop) {
        return hop.isSettingsDocument();
    }

    private boolean anyWitnessMatches(
        User owner, DocumentId doc, String issuerId, String kidId, Map<String, List<Witness>> cache) {
        List<Witness> witnesses = cache.computeIfAbsent(owner.id().id() + "/" + doc.id(), k -> witnessesOf(owner, doc));
        for (Witness witness: witnesses) {
            if (keyFileCrypto.witnessMatches(witness.witness(), witness.salt(), issuerId, kidId)) {
                return true;
            }
        }
        return false;
    }

    private List<Witness> witnessesOf(User owner, DocumentId doc) {
        List<Witness> witnesses = new ArrayList<>();
        for (String key : list(keysFolder(owner, doc)).keys()) {
            if (!key.endsWith(KEY_FILE_SUFFIX)) {
                continue;
            }
            StoredKeyFile stored = readStoredKeyFile(key).orElse(null);
            if (stored == null) {
                continue;
            }
            try {
                witnesses.add(new Witness(Base64.getDecoder().decode(stored.salt()), stored.witness()));
            } catch (IllegalArgumentException e) {
                LOG.warn("Ignoring key file with a non-base64 salt {}", key);
            }
        }
        return witnesses;
    }

    private Optional<StoredKeyFile> readStoredKeyFile(String key) {
        try {
            return find(key).map(bytes -> jsonb.fromJson(new String(bytes, UTF_8), StoredKeyFile.class));
        } catch (RuntimeException e) {
            // A single half-written or legacy-format sibling key file must not turn the whole
            // witness folder scan into a 500 and lock every member out (see StoredKeyFile's
            // requireNonNull'd fields).
            LOG.warn("Ignoring unreadable shared key file {}", key, e);
            return empty();
        }
    }

    private String keysFolder(User user, DocumentId documentId) {
        return join(documentFolder(user, documentId), "keys");
    }

    private String contributionsMarker(User owner, DocumentId documentId, User grantee) {
        return join(documentFolder(owner, documentId), "contributions",
            keyFileCrypto.fileName(documentId.id(), grantee.id().id()));
    }

    private String metadataFile(User user, DocumentId documentId) {
        return join(documentFolder(user, documentId), "metadata.enc");
    }

    private String documentFolder(User user, DocumentId documentId) {
        return join(getUserPrefix(user), "documents", documentId.id());
    }

    /** The salt and witness of one key file - all a membership test needs of it. */
    private record Witness(byte[] salt, String witness) {
    }
}
