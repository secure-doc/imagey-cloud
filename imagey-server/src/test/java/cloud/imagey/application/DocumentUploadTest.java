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
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;

import jakarta.inject.Inject;
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
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(caller.id().id()).path("documents")
            .request()
            .cookie(cookieFor(caller))
            .post(entity(body, "multipart/form-data; boundary=" + BOUNDARY));
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
