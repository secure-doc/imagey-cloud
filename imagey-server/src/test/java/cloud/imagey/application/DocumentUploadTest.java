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
package cloud.imagey.application;

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.entity;
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.CONFLICT;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static jakarta.ws.rs.core.Response.Status.FORBIDDEN;
import static jakarta.ws.rs.core.Response.Status.NOT_FOUND;
import static jakarta.ws.rs.core.Response.Status.PRECONDITION_FAILED;
import static jakarta.ws.rs.core.Response.Status.UNAUTHORIZED;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import jakarta.inject.Inject;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.junit.GreenMail;

/**
 * Integration test for the document upload (see {@code DocumentResource#uploadDocument}).
 *
 * <p>A single {@code POST /users/{caller}/documents} multipart request carries a JSON
 * {@code metadata} part ({@code UploadMetadata}: {@code folderOwner}, {@code folderId} of an
 * <em>existing</em> folder in that owner's tree, {@code documentId} of the new document, and
 * {@code key} - the document's shared key, issued by {@code folderOwner}, {@code kid} = folderId),
 * plus binary {@code folder} / {@code document} / {@code files} parts. The new document lands in the
 * caller's tree; the folder's updated content lands in {@code folderOwner}'s tree.
 */
@GreenMail
@MonoMeecrowaveConfig
public class DocumentUploadTest {

    private static final String BOUNDARY = "----ImageyUploadBoundary";
    private static final String FOLDER_ID = "11111111-1111-1111-1111-111111111111";
    private static final String DOCUMENT_ID = "22222222-2222-2222-2222-222222222222";
    private static final byte[] FOLDER_CONTENT = "folder-now-referencing-the-document".getBytes(UTF_8);
    private static final byte[] DOCUMENT_CONTENT = "the-encrypted-document-metadata".getBytes(UTF_8);

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;

    private User user;
    private Cookie userCookie;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new UserId("owner@example.com"));
        userCookie = new Cookie.Builder("token").value(tokenService.generateAuthenticationToken(user, Integer.MAX_VALUE).token()).build();

        // The folder the document will be uploaded into has to exist beforehand.
        documentRepository.persist(user, new DocumentId(FOLDER_ID),
            new EncryptedContent("folder-without-any-document".getBytes(UTF_8)));
    }

    @Test
    @DisplayName("The owner's upload stores the document in their tree and updates the folder")
    void uploadAddsDocumentToFolder() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CREATED);
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo(FOLDER_CONTENT);
        assertThat(getDocument(user, DOCUMENT_ID)).isEqualTo(DOCUMENT_CONTENT);
    }

    @Test
    @DisplayName("An upload carrying the folder's current ETag is accepted")
    void uploadWithCurrentFolderETag() {
        String currentETag = documentRepository.getETag(user, new DocumentId(FOLDER_ID)).orElseThrow();

        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID, currentETag)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CREATED);
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo(FOLDER_CONTENT);
    }

    @Test
    @DisplayName("An upload carrying the folder's current ETag as a weak validator is accepted")
    void uploadWithWeakFolderETag() {
        String currentETag = documentRepository.getETag(user, new DocumentId(FOLDER_ID)).orElseThrow();

        String weakETag = "W/\"" + currentETag + "\"";
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID, weakETag)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CREATED);
    }

    @Test
    @DisplayName("An upload carrying a stale folder ETag is rejected with 412 and nothing is written")
    void uploadWithStaleFolderETag() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID, "\"stale\"")),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(PRECONDITION_FAILED);
        assertThat(documentRepository.documentExists(user, new DocumentId(DOCUMENT_ID))).isFalse();
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo("folder-without-any-document".getBytes(UTF_8));
    }

    @Test
    @DisplayName("An upload whose documentId already names an existing document is rejected with 409")
    void uploadWithExistingDocumentId() {
        // The caller's chatList / documentList / a folder id, etc.: this endpoint only *adds* a new
        // document and must not silently overwrite an existing one's metadata.
        documentRepository.persist(user, new DocumentId(DOCUMENT_ID),
            new EncryptedContent("existing-document-metadata".getBytes(UTF_8)));

        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CONFLICT);
        assertThat(getDocument(user, DOCUMENT_ID)).isEqualTo("existing-document-metadata".getBytes(UTF_8));
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo("folder-without-any-document".getBytes(UTF_8));
    }

    @Test
    @DisplayName("A one-character folder ETag is treated as opaque and rejected with 412")
    void uploadWithSingleCharFolderETag() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID, "\"")),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(PRECONDITION_FAILED);
    }

    @Test
    @DisplayName("A folder ETag with only a leading quote is treated as opaque and rejected with 412")
    void uploadWithUnbalancedQuoteFolderETag() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID, "\"abc")),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(PRECONDITION_FAILED);
    }

    @Test
    @DisplayName("The uploaded content files are stored under the new document")
    void uploadStoresContentFiles() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT),
            filePart("files", "image", "the-image-bytes"),
            filePart("files", "preview", "the-preview-bytes"),
            filePart("files", "thumbnail", "the-thumbnail-bytes")));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CREATED);
        File filesDir = new File(new File(new File(rootPath, user.id().id()), "documents/" + DOCUMENT_ID), "files");
        assertThat(filesDir.list()).containsExactlyInAnyOrder("image", "preview", "thumbnail");
    }

    @Test
    @DisplayName("Missing metadata part leads to 400")
    void missingMetadata() {
        Response response = upload(fullBody(
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("Missing folder part leads to 400")
    void missingFolderContent() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("Missing document part leads to 400")
    void missingDocumentContent() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("Metadata without folderOwner leads to 400")
    void metadataWithoutFolderOwner() {
        String metadata = "{\"folderId\":\"" + FOLDER_ID + "\",\"documentId\":\"" + DOCUMENT_ID + "\",\"key\":"
            + keyJson(user.id().id(), FOLDER_ID) + "}";

        Response response = upload(fullBody(
            jsonPart("metadata", metadata),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("Metadata without folderId leads to 400")
    void metadataWithoutFolderId() {
        String metadata = "{\"folderOwner\":\"" + user.id().id() + "\",\"documentId\":\"" + DOCUMENT_ID
            + "\",\"key\":" + keyJson(user.id().id(), FOLDER_ID) + "}";

        Response response = upload(fullBody(
            jsonPart("metadata", metadata),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("Metadata without documentId leads to 400")
    void metadataWithoutDocumentId() {
        String metadata = "{\"folderOwner\":\"" + user.id().id() + "\",\"folderId\":\"" + FOLDER_ID
            + "\",\"key\":" + keyJson(user.id().id(), FOLDER_ID) + "}";

        Response response = upload(fullBody(
            jsonPart("metadata", metadata),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("Metadata without a shared key leads to 400")
    void metadataWithoutKey() {
        String metadata = "{\"folderOwner\":\"" + user.id().id() + "\",\"folderId\":\"" + FOLDER_ID
            + "\",\"documentId\":\"" + DOCUMENT_ID + "\"}";

        Response response = upload(fullBody(
            jsonPart("metadata", metadata),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("A shared key whose issuer is not the folder owner leads to 400")
    void keyIssuerNotFolderOwner() {
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, "someone-else@example.com", FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("A shared key whose kid is not the folderId leads to 400")
    void keyKidMismatch() {
        String wrongKid = "99999999-9999-9999-9999-999999999999";
        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), wrongKid)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(BAD_REQUEST);
    }

    @Test
    @DisplayName("A member uploads into someone else's shared folder - document in the member's tree, folder updated in the owner's")
    void memberUploadsIntoSharedFolder() {
        User member = new User(new UserId("member@example.com"));
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));

        documentRepository.allowContributions(user, new DocumentId(FOLDER_ID), member);

        Response response = uploadAs(member, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CREATED);
        assertThat(getDocument(member, DOCUMENT_ID)).isEqualTo(DOCUMENT_CONTENT);
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo(FOLDER_CONTENT);
    }

    @Test
    @DisplayName("A user who is neither owner nor folder member cannot upload and gets 403")
    void nonMemberCannotUpload() {
        User stranger = new User(new UserId("stranger@example.com"));

        Response response = uploadAs(stranger, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
    }

    @Test
    @DisplayName("A member cannot upload into a document the owner has not opened for contributions - 403, content unchanged")
    void memberCannotUploadWithoutContributionsMarker() {
        // Covers chats, groups and shared images alike: they are plain documents the members hold a key for.
        User member = new User(new UserId("member@example.com"));
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));

        Response response = uploadAs(member, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo("folder-without-any-document".getBytes(UTF_8));
        assertThat(documentRepository.documentExists(member, new DocumentId(DOCUMENT_ID))).isFalse();
    }

    @Test
    @DisplayName("A stranger uploading into a folder that does not exist gets 403, not 404 - no existence oracle")
    void strangerUploadingIntoMissingFolder() {
        User stranger = new User(new UserId("stranger@example.com"));
        String unknownFolder = "00000000-0000-0000-0000-000000000000";

        Response response = uploadAs(stranger, fullBody(
            jsonPart("metadata", metadataJson(user, unknownFolder, DOCUMENT_ID, user.id().id(), unknownFolder)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
    }

    @Test
    @DisplayName("Only the owner opens a document for contributions - a member's PUT is refused")
    void memberCannotOpenContributions() {
        User member = new User(new UserId("member@example.com"));
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));

        Response response = contributions(member, user, FOLDER_ID, member, "PUT");

        // The "owner" role check fails for anyone but the owner, which this stack reports as 401.
        assertThat(response.getStatusInfo().toEnum()).isEqualTo(UNAUTHORIZED);
        assertThat(documentRepository.allowsContributions(user, new DocumentId(FOLDER_ID), member)).isFalse();
    }

    @Test
    @DisplayName("Opening a document that does not exist for contributions leads to 404")
    void openingMissingDocument() {
        Response response = contributions(
            user, user, "00000000-0000-0000-0000-000000000000", new User(new UserId("member@example.com")), "PUT");

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(NOT_FOUND);
    }

    @Test
    @DisplayName("Closing a folder stops new contributions; contributions already made stay readable")
    void closingStopsNewContributions() {
        User member = new User(new UserId("member@example.com"));
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));
        assertThat(contributions(user, user, FOLDER_ID, member, "PUT").getStatus()).isEqualTo(204);
        assertThat(contributions(user, user, FOLDER_ID, member, "PUT").getStatus()).isEqualTo(204);
        assertThat(uploadAs(member, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT))).getStatusInfo().toEnum()).isEqualTo(CREATED);

        assertThat(contributions(user, user, FOLDER_ID, member, "DELETE").getStatus()).isEqualTo(204);

        String secondDocument = "33333333-3333-3333-3333-333333333333";
        Response response = uploadAs(member, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, secondDocument, user.id().id(), FOLDER_ID)),
            binaryPart("folder", "other".getBytes(UTF_8)),
            binaryPart("document", DOCUMENT_CONTENT)));
        assertThat(response.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
        assertThat(getDocument(member, DOCUMENT_ID)).isEqualTo(DOCUMENT_CONTENT);
        assertThat(getDocument(user, FOLDER_ID)).isEqualTo(FOLDER_CONTENT);
    }

    @Test
    @DisplayName("A member with the right on the shared folder uploads into a subfolder below it - no marker on the subfolder")
    void memberUploadsIntoSubfolderViaAccessPath() {
        User member = new User(new UserId("member@example.com"));
        String subfolderId = "44444444-4444-4444-4444-444444444444";
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));
        documentRepository.persist(user, new DocumentId(subfolderId),
            new EncryptedContent("subfolder".getBytes(UTF_8)));
        documentRepository.create(user, new DocumentId(subfolderId), new EncryptedSharedKey(
            user, new Kid(FOLDER_ID), new EncryptedSymmetricKey("c3ViLWtleQ==")));
        documentRepository.allowContributions(user, new DocumentId(FOLDER_ID), member);
        String chain = "{\"chain\":[{\"doc\":\"" + subfolderId + "\",\"owner\":\"" + user.id().id()
            + "\",\"wrappedBy\":\"" + FOLDER_ID + "\"},{\"doc\":\"" + FOLDER_ID + "\",\"owner\":\""
            + user.id().id() + "\",\"wrappedBy\":\"" + FOLDER_ID + "\"}]}";
        String header = Base64.getUrlEncoder().withoutPadding().encodeToString(chain.getBytes(UTF_8));

        Response withoutPath = uploadAs(member, null, fullBody(
            jsonPart("metadata", metadataJson(user, subfolderId, DOCUMENT_ID, user.id().id(), subfolderId)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));
        Response withPath = uploadAs(member, header, fullBody(
            jsonPart("metadata", metadataJson(user, subfolderId, DOCUMENT_ID, user.id().id(), subfolderId)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(withoutPath.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
        assertThat(withPath.getStatusInfo().toEnum()).isEqualTo(CREATED);
    }

    @Test
    @DisplayName("The right is per recipient: one with a read-only share is refused although another may contribute")
    void readOnlyRecipientCannotUpload() {
        User writer = new User(new UserId("writer@example.com"));
        User reader = new User(new UserId("reader@example.com"));
        for (User recipient: List.of(writer, reader)) {
            documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
                recipient, new Kid(recipient.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));
        }
        assertThat(contributions(user, user, FOLDER_ID, writer, "PUT").getStatus()).isEqualTo(204);

        Response asReader = uploadAs(reader, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));
        Response asWriter = uploadAs(writer, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(asReader.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
        assertThat(asWriter.getStatusInfo().toEnum()).isEqualTo(CREATED);
    }

    @Test
    @DisplayName("A right is only given to somebody the folder is shared with - otherwise 409")
    void rightNeedsAGrant() {
        User stranger = new User(new UserId("stranger@example.com"));

        Response response = contributions(user, user, FOLDER_ID, stranger, "PUT");

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CONFLICT);
        assertThat(documentRepository.allowsContributions(user, new DocumentId(FOLDER_ID), stranger)).isFalse();
    }

    @Test
    @DisplayName("The owner writes into a subfolder a member created in the member's own tree, without any marker")
    void ownerWritesIntoContributorsSubfolder() {
        User member = new User(new UserId("member@example.com"));
        String subfolderId = "55555555-5555-5555-5555-555555555555";
        // The member's folder below the owner's: a key issued by the owner, wrapped for the folder.
        documentRepository.persist(member, new DocumentId(subfolderId),
            new EncryptedContent("members-subfolder".getBytes(UTF_8)));
        documentRepository.create(member, new DocumentId(subfolderId), new EncryptedSharedKey(
            user, new Kid(FOLDER_ID), new EncryptedSymmetricKey("c3ViLWtleQ==")));
        String chain = "{\"chain\":[{\"doc\":\"" + subfolderId + "\",\"owner\":\"" + member.id().id()
            + "\",\"wrappedBy\":\"" + FOLDER_ID + "\"},{\"doc\":\"" + FOLDER_ID + "\",\"owner\":\""
            + user.id().id() + "\",\"wrappedBy\":\"" + FOLDER_ID + "\"}]}";
        String header = Base64.getUrlEncoder().withoutPadding().encodeToString(chain.getBytes(UTF_8));

        Response response = uploadAs(user, header, fullBody(
            jsonPart("metadata", metadataJson(member, subfolderId, DOCUMENT_ID, member.id().id(), subfolderId)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(CREATED);
        assertThat(getDocument(member, subfolderId)).isEqualTo(FOLDER_CONTENT);
    }

    @Test
    @DisplayName("A read-only share deeper down does not hide the right on the shared folder above it")
    void rightAboveIsNotHiddenByShareBelow() {
        User member = new User(new UserId("member@example.com"));
        String subfolderId = "66666666-6666-6666-6666-666666666666";
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));
        documentRepository.persist(user, new DocumentId(subfolderId),
            new EncryptedContent("subfolder".getBytes(UTF_8)));
        documentRepository.create(user, new DocumentId(subfolderId), new EncryptedSharedKey(
            user, new Kid(FOLDER_ID), new EncryptedSymmetricKey("c3ViLWtleQ==")));
        // The subfolder was sent to the member on its own as well, without the right.
        documentRepository.create(user, new DocumentId(subfolderId), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("c2VuZA==")));
        String header = accessPath(subfolderId, user, FOLDER_ID, user, FOLDER_ID);

        Response withoutRight = uploadAs(member, header, fullBody(
            jsonPart("metadata", metadataJson(user, subfolderId, DOCUMENT_ID, user.id().id(), subfolderId)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));
        documentRepository.allowContributions(user, new DocumentId(FOLDER_ID), member);
        Response withRight = uploadAs(member, header, fullBody(
            jsonPart("metadata", metadataJson(user, subfolderId, DOCUMENT_ID, user.id().id(), subfolderId)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(withoutRight.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
        assertThat(withRight.getStatusInfo().toEnum()).isEqualTo(CREATED);
    }

    @Test
    @DisplayName("The caller's own settings document is no terminus for writing - a direct grant slot is not a folder of his tree")
    void settingsDocumentIsNoTerminusForWriting() {
        User member = new User(new UserId("member@example.com"));
        documentRepository.create(user, new DocumentId(FOLDER_ID), new EncryptedSharedKey(
            member, new Kid(member.id().id()), new EncryptedSymmetricKey("d3JhcHBlZA==")));
        // The direct grant's slot is also the link to the member's own settings document.
        String header = accessPath(FOLDER_ID, user, member.id().id(), member, member.id().id());

        Response response = uploadAs(member, header, fullBody(
            jsonPart("metadata", metadataJson(user, FOLDER_ID, DOCUMENT_ID, user.id().id(), FOLDER_ID)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(FORBIDDEN);
    }

    @Test
    @DisplayName("Taking away a right that was never given is fine - the answer is the same")
    void takingAwayAMissingRight() {
        User member = new User(new UserId("member@example.com"));

        assertThat(contributions(user, user, FOLDER_ID, member, "DELETE").getStatus()).isEqualTo(204);
    }

    @Test
    @DisplayName("Concurrent uploads into the same folder carrying the same folderETag - exactly one succeeds, the rest get 412")
    void concurrentUploadsIntoSameFolder() throws InterruptedException, ExecutionException {
        // Every racer must race the *same* known-stale value, not its own live read: two requests
        // that never truly overlap (one completes before the other's internal read) would otherwise
        // both legitimately succeed in sequence - that is not a race, just two ordinary successive
        // uploads, and asserting "exactly one 201" against that is flaky, not a real property. Fixing
        // the folderETag every racer carries to one value captured before any of them run makes the
        // outcome deterministic regardless of actual thread interleaving: whichever request is first
        // to actually land changes the stored ETag, so every other racer's explicit folderETag check
        // fails immediately - and if several requests are genuinely reading before anyone has written,
        // that is exactly the CAS race DocumentRepository#persistIfCurrent (ADR 0012) resolves down to
        // one winner. Either way, precisely one winner is guaranteed by construction, not by timing.
        int racers = 8;
        String currentETag = documentRepository.getETag(user, new DocumentId(FOLDER_ID)).orElseThrow();
        ExecutorService executor = Executors.newFixedThreadPool(racers);
        try {
            List<Callable<Response>> attempts = IntStream.range(0, racers)
                .<Callable<Response>>mapToObj(i -> () -> {
                    String documentId = UUID.randomUUID().toString();
                    return upload(fullBody(
                        jsonPart("metadata",
                            metadataJson(user, FOLDER_ID, documentId, user.id().id(), FOLDER_ID, currentETag)),
                        binaryPart("folder", ("folder-content-" + documentId).getBytes(UTF_8)),
                        binaryPart("document", DOCUMENT_CONTENT)));
                })
                .toList();
            List<Future<Response>> results = executor.invokeAll(attempts);

            long created = 0;
            long preconditionFailed = 0;
            for (Future<Response> result : results) {
                Response.Status status = result.get().getStatusInfo().toEnum();
                if (status == CREATED) {
                    created++;
                } else if (status == PRECONDITION_FAILED) {
                    preconditionFailed++;
                }
            }

            assertThat(created).isEqualTo(1);
            assertThat(preconditionFailed).isEqualTo(racers - 1);
        } finally {
            executor.shutdown();
        }
    }

    @Test
    @DisplayName("Uploading into a folder that does not exist leads to 404")
    void folderDoesNotExist() {
        String unknownFolder = "00000000-0000-0000-0000-000000000000";

        Response response = upload(fullBody(
            jsonPart("metadata", metadataJson(user, unknownFolder, DOCUMENT_ID, user.id().id(), unknownFolder)),
            binaryPart("folder", FOLDER_CONTENT),
            binaryPart("document", DOCUMENT_CONTENT)));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(NOT_FOUND);
    }

    private Response upload(String body) {
        return uploadAs(user, body);
    }

    private Response uploadAs(User caller, String body) {
        return uploadAs(caller, null, body);
    }

    private Response uploadAs(User caller, String accessPath, String body) {
        Invocation.Builder request = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(caller.id().id()).path("documents")
            .request()
            .cookie(cookieFor(caller));
        if (accessPath != null) {
            request = request.header("Access-Path", accessPath);
        }
        return request.post(entity(body, "multipart/form-data; boundary=" + BOUNDARY));
    }

    // The Access-Path header for a chain of (doc, owner, wrappedBy) hops given as repeating triples.
    private static String accessPath(String doc0, User owner0, String wrappedBy0, User owner1, String doc1) {
        String chain = "{\"chain\":[{\"doc\":\"" + doc0 + "\",\"owner\":\"" + owner0.id().id()
            + "\",\"wrappedBy\":\"" + wrappedBy0 + "\"},{\"doc\":\"" + doc1 + "\",\"owner\":\""
            + owner1.id().id() + "\",\"wrappedBy\":\"" + doc1 + "\"}]}";
        return Base64.getUrlEncoder().withoutPadding().encodeToString(chain.getBytes(UTF_8));
    }

    private Response contributions(User caller, User owner, String documentId, User grantee, String method) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(owner.id().id()).path("documents").path(documentId).path("contributions")
            .path(grantee.id().id())
            .request()
            .cookie(cookieFor(caller))
            .method(method);
    }

    private byte[] getDocument(User owner, String documentId) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(owner.id().id()).path("documents").path(documentId)
            .request("application/octet-stream")
            .cookie(cookieFor(owner))
            .get(byte[].class);
    }

    private Cookie cookieFor(User caller) {
        return user.equals(caller) ? userCookie
            : new Cookie.Builder("token").value(tokenService.generateAuthenticationToken(caller, Integer.MAX_VALUE).token()).build();
    }

    private static String metadataJson(User folderOwner, String folderId, String documentId, String issuer, String kid) {
        return metadataJson(folderOwner, folderId, documentId, issuer, kid, null);
    }

    private static String metadataJson(
        User folderOwner, String folderId, String documentId, String issuer, String kid, String folderETag) {
        return "{\"folderOwner\":\"" + folderOwner.id().id() + "\","
            + "\"folderId\":\"" + folderId + "\","
            + (folderETag == null ? "" : "\"folderETag\":\"" + folderETag.replace("\"", "\\\"") + "\",")
            + "\"documentId\":\"" + documentId + "\","
            + "\"key\":" + keyJson(issuer, kid) + "}";
    }

    private static String keyJson(String issuer, String kid) {
        return "{\"issuer\":\"" + issuer + "\",\"kid\":\"" + kid + "\",\"sharedKey\":\"c2hhcmVkLWtleQ==\"}";
    }

    private static String fullBody(String... parts) {
        return String.join("", parts) + "--" + BOUNDARY + "--\r\n";
    }

    private static String jsonPart(String name, String json) {
        return "--" + BOUNDARY + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"\r\n"
            + "Content-Type: application/json\r\n\r\n"
            + json + "\r\n";
    }

    private static String binaryPart(String name, byte[] value) {
        return "--" + BOUNDARY + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"\r\n"
            + "Content-Type: application/octet-stream\r\n\r\n"
            + new String(value, UTF_8) + "\r\n";
    }

    private static String filePart(String name, String filename, String value) {
        return "--" + BOUNDARY + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\n"
            + "Content-Type: application/octet-stream\r\n\r\n"
            + value + "\r\n";
    }
}
