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

import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.File;
import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.document.AccessPath.Hop;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.infrastructure.ResourceConflictException;
import cloud.imagey.infrastructure.common.KeyFileCrypto;

@MonoMeecrowaveConfig
public class DocumentRepositoryTest {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    private DocumentRepository documentRepository;

    @Inject
    private KeyFileCrypto keyFileCrypto;

    private User user;
    private DocumentId documentId;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new UserId("test-user"));
        documentId = new DocumentId(UUID.randomUUID().toString());
    }

    @Test
    @DisplayName("persist metadata when folder already exists")
    void persistMetadataFolderExists() {
        File userHome = new File(rootPath, user.id().id());
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
        File userHome = new File(rootPath, user.id().id());
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
    @DisplayName("getETag with non-existent metadata returns empty")
    void getETagNonExistent() {
        Optional<String> etag = documentRepository.getETag(user, documentId);
        assertThat(etag).isEmpty();
    }

    @Test
    @DisplayName("getETag changes when the stored metadata changes")
    void getETagTracksContent() {
        documentRepository.persist(user, documentId, new EncryptedContent(new byte[]{1, 2, 3}));
        Optional<String> first = documentRepository.getETag(user, documentId);

        documentRepository.persist(user, documentId, new EncryptedContent(new byte[]{4, 5, 6}));
        Optional<String> second = documentRepository.getETag(user, documentId);

        assertThat(first).isPresent();
        assertThat(second).isPresent().isNotEqualTo(first);
    }

    @Test
    @DisplayName("loadEncryptedMetadataWithETag returns the same content and etag as the single-value calls, reading once")
    void loadEncryptedMetadataWithETag() {
        documentRepository.persist(user, documentId, new EncryptedContent(new byte[]{7, 8, 9}));

        Optional<EncryptedMetadata> combined = documentRepository.loadEncryptedMetadataWithETag(user, documentId);

        assertThat(combined).isPresent();
        assertThat(combined.get().content().content()).isEqualTo(new byte[]{7, 8, 9});
        assertThat(combined.get().etag()).isEqualTo(documentRepository.getETag(user, documentId).orElseThrow());
    }

    @Test
    @DisplayName("loadEncryptedMetadataWithETag returns empty when metadata is missing")
    void loadEncryptedMetadataWithETagMissing() {
        assertThat(documentRepository.loadEncryptedMetadataWithETag(user, documentId)).isEmpty();
    }

    @Test
    @DisplayName("etagOf matches the etag the content has once stored")
    void etagOfMatchesStored() {
        EncryptedContent content = new EncryptedContent(new byte[]{3, 1, 4, 1, 5});
        documentRepository.persist(user, documentId, content);

        assertThat(documentRepository.etagOf(content))
            .isEqualTo(documentRepository.getETag(user, documentId).orElseThrow());
    }

    @Test
    @DisplayName("loadEncryptedMetadata when metadata is missing returns empty")
    void loadEncryptedMetadataMissing() {
        File documentFolder = new File(new File(new File(rootPath, user.id().id()), "documents"), documentId.id());
        documentFolder.mkdirs();

        Optional<EncryptedContent> metadata = documentRepository.loadEncryptedMetadata(user, documentId);
        assertThat(metadata).isEmpty();
    }

    @Test
    @DisplayName("findDocumentKey when key does not exist returns empty")
    void findDocumentKeyNonExistent() {
        Optional<WrappedKey> key = documentRepository.findDocumentKey(user, documentId, new Kid("friend@example.com"));
        assertThat(key).isEmpty();
    }

    @Test
    @DisplayName("create writes a key file under a hashed name, without a plaintext issuer or kid")
    void createHidesIssuerAndKid() {
        Kid friend = new Kid("friend@example.com");
        documentRepository.create(user, documentId, sharedKey(user, friend.id(), "d3JhcHBlZA=="));

        File keysDir = new File(new File(new File(new File(rootPath, user.id().id()), "documents"),
            documentId.id()), "keys");
        assertThat(keysDir.list()).hasSize(1);
        String contents = readFile(keysDir.listFiles()[0]);
        assertThat(contents).contains("\"salt\"").contains("\"witness\"").contains("d3JhcHBlZA==");
        assertThat(contents).doesNotContain("friend@example.com").doesNotContain("\"issuer\"").doesNotContain("\"kid\"");
    }

    @Test
    @DisplayName("create re-uses an occupied key slot only for an identical sharedKey, otherwise 409")
    void createIsWriteOnce() {
        Kid friend = new Kid("friend@example.com");
        documentRepository.create(user, documentId, sharedKey(user, friend.id(), "d3JhcHBlZA=="));

        // identical sharedKey -> no-op (salt / witness differ on every write, so only sharedKey is compared)
        documentRepository.create(user, documentId, sharedKey(user, friend.id(), "d3JhcHBlZA=="));

        // same slot, different sharedKey -> conflict
        assertThatThrownBy(() -> documentRepository.create(user, documentId, sharedKey(user, friend.id(), "b3RoZXI=")))
            .isInstanceOf(ResourceConflictException.class);
    }

    @Test
    @DisplayName("findDocumentKey returns just the wrapped key ciphertext for the (documentId, kid) pair")
    void findDocumentKeyRoundTrips() {
        User folderUser = new User(new UserId("folder123"));
        User issuer = new User(new UserId("friend@example.com"));
        Kid lookupKid = new Kid("some-folder-id");

        documentRepository.create(folderUser, documentId, sharedKey(issuer, lookupKid.id(), "d3JhcHBlZA=="));

        Optional<WrappedKey> wrapped = documentRepository.findDocumentKey(folderUser, documentId, lookupKid);
        assertThat(wrapped).isPresent();
        assertThat(wrapped.get().sharedKey()).isEqualTo(new EncryptedSymmetricKey("d3JhcHBlZA=="));
        // a different kid does not resolve to this file (the name is edge-unique)
        assertThat(documentRepository.findDocumentKey(folderUser, documentId, new Kid("other-folder-id"))).isEmpty();
    }

    @Test
    @DisplayName("hasDirectGrant is true only for the self-referential (caller, caller) witness")
    void hasDirectGrant() {
        User member = new User(new UserId("member@example.com"));
        documentRepository.persist(user, documentId, new EncryptedContent("meta".getBytes()));
        documentRepository.create(user, documentId, sharedKey(member, member.id().id(), "d3JhcHBlZA=="));

        assertThat(documentRepository.hasDirectGrant(user, documentId, member)).isTrue();
        assertThat(documentRepository.hasDirectGrant(user, documentId, new User(new UserId("stranger@example.com"))))
            .isFalse();
    }

    @Test
    @DisplayName("verifyAccess allows the direct-grant holder with no Access-Path")
    void verifyAccessDirectGrant() {
        User member = new User(new UserId("member@example.com"));
        documentRepository.persist(user, documentId, new EncryptedContent("meta".getBytes()));
        documentRepository.create(user, documentId, sharedKey(member, member.id().id(), "d3JhcHBlZA=="));

        assertThat(documentRepository.verifyAccess(user, documentId, member, null)).isTrue();
        assertThat(documentRepository.verifyAccess(user, documentId, new User(new UserId("nobody")), null)).isFalse();
    }

    @Test
    @DisplayName("verifyAccess follows a one-hop Access-Path from a nested document to a shared folder")
    void verifyAccessOneHop() {
        User member = new User(new UserId("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());

        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(member, member.id().id(), "Zm9sZGVy"));

        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(user, folder.id(), "ZG9j"));

        AccessPath path = new AccessPath(java.util.List.of(
            new Hop(documentId, user, folder),
            new Hop(folder, user, folder)));

        assertThat(documentRepository.verifyAccess(user, documentId, member, path)).isTrue();
        // without the chain the nested document is not reachable
        assertThat(documentRepository.verifyAccess(user, documentId, member, null)).isFalse();
    }

    @Test
    @DisplayName("verifyAccess follows a hop into the folder owner's tree (contribution to a shared folder)")
    void verifyAccessCrossesTrees() {
        User folderOwner = new User(new UserId("bob@example.com"));
        User member = new User(new UserId("carol@example.com"));
        DocumentId folder = new DocumentId("shared-folder-" + UUID.randomUUID());

        documentRepository.persist(folderOwner, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(folderOwner, folder, sharedKey(member, member.id().id(), "Zm9sZGVy"));

        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(folderOwner, folder.id(), "ZG9j"));

        AccessPath path = new AccessPath(java.util.List.of(
            new Hop(documentId, user, folder),
            new Hop(folder, folderOwner, folder)));

        assertThat(documentRepository.verifyAccess(user, documentId, member, path)).isTrue();
        assertThat(documentRepository.verifyAccess(user, documentId, folderOwner, path)).isTrue();
        assertThat(documentRepository.verifyAccess(user, documentId, new User(new UserId("dave@example.com")), path))
            .isFalse();
    }

    @Test
    @DisplayName("verifyAccess rejects a chain whose wrappedBy link does not match the next hop")
    void verifyAccessWrongLink() {
        User member = new User(new UserId("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());
        DocumentId other = new DocumentId("other-" + UUID.randomUUID());

        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(member, member.id().id(), "Zm9sZGVy"));
        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(user, folder.id(), "ZG9j"));

        AccessPath path = new AccessPath(java.util.List.of(
            new Hop(documentId, user, other),
            new Hop(folder, user, folder)));

        assertThat(documentRepository.verifyAccess(user, documentId, member, path)).isFalse();
    }

    @Test
    @DisplayName("verifyAccess rejects a forged chain whose first hop is not the requested document")
    void verifyAccessForgedFirstHop() {
        User member = new User(new UserId("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());
        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(member, member.id().id(), "Zm9sZGVy"));

        AccessPath path = new AccessPath(java.util.List.of(new Hop(folder, user, folder)));

        assertThat(documentRepository.verifyAccess(user, documentId, member, path)).isFalse();
    }

    @Test
    @DisplayName("verifyAccess rejects an empty chain and a first hop naming the wrong owner")
    void verifyAccessEmptyChainAndWrongOwner() {
        User member = new User(new UserId("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());
        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(member, member.id().id(), "Zm9sZGVy"));
        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(user, folder.id(), "ZG9j"));

        assertThat(documentRepository.verifyAccess(user, documentId, member, new AccessPath(java.util.List.of())))
            .isFalse();

        AccessPath wrongOwner = new AccessPath(java.util.List.of(
            new Hop(documentId, new User(new UserId("someone-else")), folder),
            new Hop(folder, user, folder)));
        assertThat(documentRepository.verifyAccess(user, documentId, member, wrongOwner)).isFalse();
    }

    @Test
    @DisplayName("verifyAccess denies a well-formed chain that never reaches a direct grant")
    void verifyAccessNoTerminus() {
        User member = new User(new UserId("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());

        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(user, "0", "Zm9sZGVy"));
        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(user, folder.id(), "ZG9j"));

        AccessPath path = new AccessPath(java.util.List.of(
            new Hop(documentId, user, folder),
            new Hop(folder, user, folder)));

        assertThat(documentRepository.verifyAccess(user, documentId, member, path)).isFalse();
    }

    @Test
    @DisplayName("verifyAccess rejects a chain hopping through a hop-owner's own settings document")
    void verifyAccessRejectsHopThroughOwnSettingsDocument() {
        // O = user/documentId (real content), Y legitimately received a direct
        // grant on it. Y then plants a fake "direct grant to M" key file under
        // Y's *own* settings document (docId == Y's own userId) - the same slot
        // every direct grant's witness is filed under. M must not be able to use
        // that self-planted witness as a chain terminus for O's document.
        User yvonne = new User(new UserId("yvonne@example.com"));
        User mallory = new User(new UserId("mallory@example.com"));
        DocumentId yvonneSettings = new DocumentId(yvonne.id().id());

        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(yvonne, yvonne.id().id(), "Zm9yWXZvbm5l"));

        documentRepository.persist(yvonne, yvonneSettings, new EncryptedContent("settings".getBytes()));
        documentRepository.create(yvonne, yvonneSettings, sharedKey(mallory, mallory.id().id(), "Zm9yTWFsbG9yeQ=="));

        AccessPath path = new AccessPath(java.util.List.of(
            new Hop(documentId, user, yvonneSettings),
            new Hop(yvonneSettings, yvonne, yvonneSettings)));

        assertThat(documentRepository.verifyAccess(user, documentId, mallory, path)).isFalse();
        // Yvonne herself still legitimately reaches the document through the same chain.
        assertThat(documentRepository.verifyAccess(user, documentId, yvonne, path)).isTrue();
    }

    @Test
    @DisplayName("anyWitnessMatches (via verifyAccess) ignores an unreadable key file")
    void skipsUnreadableKeyFile() {
        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        writeRawKeyFile(user, documentId, "garbage", "not json");

        assertThat(documentRepository.verifyAccess(user, documentId, new User(new UserId("member@example.com")), null))
            .isFalse();
    }

    @Test
    @DisplayName("create over an unreadable occupied slot is a 409 (cannot confirm the sharedKey matches)")
    void createOverUnreadableSlotConflicts() {
        Kid friend = new Kid("friend@example.com");
        File target = new File(new File(new File(new File(new File(rootPath, user.id().id()), "documents"),
            documentId.id()), "keys"), keyFileCrypto.fileName(documentId.id(), friend.id()));
        target.getParentFile().mkdirs();
        try {
            java.nio.file.Files.writeString(target.toPath(), "not json");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }

        assertThatThrownBy(() -> documentRepository.create(user, documentId, sharedKey(user, friend.id(), "d3JhcHBlZA==")))
            .isInstanceOf(ResourceConflictException.class);
    }

    private static EncryptedSharedKey sharedKey(User issuer, String kid, String wrapped) {
        return new EncryptedSharedKey(issuer, new Kid(kid), new EncryptedSymmetricKey(wrapped));
    }

    private static String readFile(File file) {
        try {
            return java.nio.file.Files.readString(file.toPath());
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private void writeRawKeyFile(User owner, DocumentId docId, String name, String content) {
        File keyFile = new File(new File(new File(new File(new File(rootPath, owner.id().id()), "documents"),
            docId.id()), "keys"), name + ".json");
        keyFile.getParentFile().mkdirs();
        try {
            java.nio.file.Files.writeString(keyFile.toPath(), content);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
