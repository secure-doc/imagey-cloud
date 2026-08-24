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

import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.ResourceConflictException;

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
        File documentFolder = new File(new File(new File(rootPath, user.email().address()), "documents"), documentId.id());
        documentFolder.mkdirs();

        Optional<EncryptedContent> metadata = documentRepository.loadEncryptedMetadata(user, documentId);
        assertThat(metadata).isEmpty();
    }

    @Test
    @DisplayName("findDocumentKey when key does not exist returns empty")
    void findDocumentKeyNonExistent() {
        Optional<EncryptedSharedKey> key = documentRepository.findDocumentKey(user, documentId, new Kid("friend@example.com"));
        assertThat(key).isEmpty();
    }

    @Test
    @DisplayName("persist shared key writes a keys/{kid}.json file")
    void persistSharedKeyWritesJsonFile() {
        Kid friend = new Kid("friend@example.com");
        File keyFile = keyFile(user, documentId, friend.id());
        keyFile.getParentFile().mkdirs();

        documentRepository.create(user, documentId, sharedKey(user, friend.id()));

        assertThat(keyFile).exists().content().contains("\"issuer\":\"test@example.com\"");
    }

    @Test
    @DisplayName("persist re-uses an occupied key slot only for identical content, otherwise 409")
    void persistSharedKeyIsWriteOnce() {
        Kid friend = new Kid("friend@example.com");
        documentRepository.create(user, documentId, sharedKey(user, friend.id()));

        // identical content -> no-op
        documentRepository.create(user, documentId, sharedKey(user, friend.id()));

        // same slot, different issuer -> conflict
        User other = new User(new Email("other@example.com"));
        assertThatThrownBy(() -> documentRepository.create(user, documentId, sharedKey(other, friend.id())))
            .isInstanceOf(ResourceConflictException.class);
    }

    @Test
    @DisplayName("findDocumentKey round-trips the persisted issuer and kid")
    void findDocumentKeyRoundTrips() {
        User folderUser = new User(new Email("folder123"));
        User issuer = new User(new Email("friend@example.com"));
        Kid lookupKid = new Kid("some-folder-id");

        documentRepository.create(folderUser, documentId, sharedKey(issuer, lookupKid.id()));

        Optional<EncryptedSharedKey> sharedKey = documentRepository.findDocumentKey(folderUser, documentId, lookupKid);
        assertThat(sharedKey).isPresent();
        assertThat(sharedKey.get().issuer()).isEqualTo(issuer);
        assertThat(sharedKey.get().kid()).isEqualTo(lookupKid);
    }

    @Test
    @DisplayName("isIssuerInKeyChain is true for a key issued directly by the member")
    void isIssuerInKeyChainDirect() {
        User member = new User(new Email("member@example.com"));
        documentRepository.persist(user, documentId, new EncryptedContent("meta".getBytes()));
        documentRepository.create(user, documentId, sharedKey(member, member.email().address()));

        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, member)).isTrue();
        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, new User(new Email("stranger@example.com"))))
            .isFalse();
    }

    @Test
    @DisplayName("isIssuerInKeyChain follows a key filed under a parent document the member can reach")
    void isIssuerInKeyChainRecursive() {
        User member = new User(new Email("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());

        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(member, member.email().address()));

        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(user, folder.id()));

        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, member)).isTrue();
    }

    @Test
    @DisplayName("isIssuerInKeyChain follows a key into the parent's owner's tree (contribution to a shared folder)")
    void isIssuerInKeyChainCrossesTrees() {
        User folderOwner = new User(new Email("bob@example.com"));
        User member = new User(new Email("carol@example.com"));
        DocumentId folder = new DocumentId("shared-folder-" + UUID.randomUUID());

        // Bob's folder, shared with Carol (a key she issued)
        documentRepository.persist(folderOwner, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(folderOwner, folder, sharedKey(member, member.email().address()));

        // Carol's document, added to Bob's folder - its key is issued by Bob (owner of the folder key)
        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(folderOwner, folder.id()));

        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, member)).isTrue();
        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, folderOwner)).isTrue();
        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, new User(new Email("dave@example.com"))))
            .isFalse();
    }

    @Test
    @DisplayName("isIssuerInKeyChain is false when the reachable parent document has no key for the member")
    void isIssuerInKeyChainParentWithoutMember() {
        User member = new User(new Email("member@example.com"));
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());

        documentRepository.persist(user, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(user, folder, sharedKey(user, "0"));

        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(user, documentId, sharedKey(user, folder.id()));

        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, member)).isFalse();
    }

    @Test
    @DisplayName("isIssuerInKeyChain terminates when keys point in a cycle")
    void isIssuerInKeyChainCycle() {
        DocumentId a = new DocumentId("a-" + UUID.randomUUID());
        DocumentId b = new DocumentId("b-" + UUID.randomUUID());
        documentRepository.persist(user, a, new EncryptedContent("a".getBytes()));
        documentRepository.persist(user, b, new EncryptedContent("b".getBytes()));
        documentRepository.create(user, a, sharedKey(user, b.id()));
        documentRepository.create(user, b, sharedKey(user, a.id()));

        assertThat(documentRepository.isIssuerInKeyChain(user, a, new User(new Email("member@example.com")))).isFalse();
    }

    @Test
    @DisplayName("isIssuerInKeyChain ignores an unreadable key file")
    void isIssuerInKeyChainSkipsUnreadableKeyFile() {
        documentRepository.persist(user, documentId, new EncryptedContent("doc".getBytes()));
        writeRawKeyFile(user, documentId, "garbage", "not json");

        assertThat(documentRepository.isIssuerInKeyChain(user, documentId, new User(new Email("member@example.com"))))
            .isFalse();
    }

    private static EncryptedSharedKey sharedKey(User issuer, String kid) {
        return new EncryptedSharedKey(issuer, new Kid(kid), new EncryptedSymmetricKey("d3JhcHBlZA=="));
    }

    private File keyFile(User owner, DocumentId docId, String kid) {
        return new File(new File(new File(new File(new File(rootPath, owner.email().address()), "documents"),
            docId.id()), "keys"), kid + ".json");
    }

    private void writeRawKeyFile(User owner, DocumentId docId, String kid, String content) {
        File keyFile = keyFile(owner, docId, kid);
        keyFile.getParentFile().mkdirs();
        try {
            java.nio.file.Files.writeString(keyFile.toPath(), content);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
