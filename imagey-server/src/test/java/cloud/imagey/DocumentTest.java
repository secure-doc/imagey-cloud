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
package cloud.imagey;

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.entity;
import static jakarta.ws.rs.client.Entity.json;
import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON_TYPE;
import static jakarta.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM_TYPE;
import static jakarta.ws.rs.core.MediaType.MULTIPART_FORM_DATA_TYPE;
import static jakarta.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static java.lang.Integer.MAX_VALUE;
import static java.util.Arrays.stream;
import static java.util.Set.of;
import static org.apache.commons.io.FileUtils.deleteDirectory;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Map;

import jakarta.inject.Inject;
import jakarta.ws.rs.core.GenericType;
import jakarta.ws.rs.core.Response;

import org.apache.cxf.jaxrs.ext.multipart.Attachment;
import org.apache.cxf.jaxrs.ext.multipart.MultipartBody;
import org.apache.cxf.jaxrs.impl.MetadataMap;
import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
@MonoMeecrowaveConfig
public class DocumentTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;

    @Test
    @DisplayName("Store document")
    public void storeDocument() throws IOException {
        // Given
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);
        String documentId = "db8113df-acd2-4c72-b044-f770d4e2cca9";
        String smallImageId = "e33359bc-a2c4-404e-9553-ab40bb2ea75d";
        String previewImageId = "5a4a3dd2-398c-41a4-a76b-8a1d006768cf";
        byte[] documentContent = new byte[] {123, -108, 98, 27, -126, 65};
        byte[] smallContent = new byte[] {123, -108};
        byte[] previewContent = new byte[] {123, -108, 98, 27};
        String sharedKey = "{\"issuer\":\"mary@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\"alkdjföalsdjkföa\"}";

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .put(json("""
                {
                    "documentId": "%s",
                    "encryptedData": "dummy-encrypted-data"
                }
            """.formatted(documentId)));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("files")
                .path(documentId)
                .request()
                .header("Origin", "https://secure-doc.store")
                .header("Cookie", "token=" + token.token())
                .put(entity(documentContent, APPLICATION_OCTET_STREAM_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("files")
                .path(smallImageId)
                .request().header("Origin", "https://secure-doc.store")
                .header("Cookie", "token=" + token.token())
                .put(entity(smallContent, APPLICATION_OCTET_STREAM_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("files")
                .path(previewImageId)
                .request()
                .header("Origin", "https://secure-doc.store")
                .header("Cookie", "token=" + token.token())
                .put(entity(previewContent, APPLICATION_OCTET_STREAM_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("keys/mary@imagey.cloud")
                .request()
                .header("Origin", "https://secure-doc.store")
                .header("Cookie", "token=" + token.token())
                .put(entity(sharedKey, APPLICATION_JSON_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Then
        List<Map<String, Object>> metadatas = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get(new GenericType<List<Map<String, Object>>>() { });
        Map<String, Object> metadata = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .path(documentId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get(new GenericType<Map<String, Object>>() { });
        assertThat(metadatas).contains(metadata);
        assertThat(metadata).contains(
            entry("documentId", documentId),
            entry("encryptedData", "dummy-encrypted-data"),
            entry("sharedKey", Map.of("issuer", "mary@imagey.cloud", "kid", "0", "sharedKey", "alkdjföalsdjkföa")));
        byte[] actualDocumentContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("files")
            .path(documentId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get(byte[].class);
        byte[] actualSmallImageContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("files")
            .path(smallImageId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get(byte[].class);
        byte[] actualPreviewImageContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("files")
            .path(previewImageId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get(byte[].class);
        assertThat(actualDocumentContent).isEqualTo(documentContent);
        assertThat(actualSmallImageContent).isEqualTo(smallContent);
        assertThat(actualPreviewImageContent).isEqualTo(previewContent);

        // Share with Joe
        Token joeToken = tokenService.generateToken(new User(new Email("joe@imagey.cloud")), MAX_VALUE);
        String joeSharedKey = "{\"issuer\":\"mary@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\"joes-shared-key\"}";
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("keys/joe@imagey.cloud")
                .request()
                .header("Origin", "https://secure-doc.store")
                .header("Cookie", "token=" + token.token()) // Mary's token to PUT the key
                .put(entity(joeSharedKey, APPLICATION_JSON_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Joe reads metadata
        Map<String, Object> joeMetadata = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .path(documentId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + joeToken.token())
            .get(new GenericType<Map<String, Object>>() { });
        assertThat(joeMetadata).contains(
            entry("documentId", documentId),
            entry("encryptedData", "dummy-encrypted-data"));

        // Joe reads content
        byte[] joeReadContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("files")
            .path(documentId)
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + joeToken.token())
            .get(byte[].class);
        assertThat(joeReadContent).isEqualTo(documentContent);

        // Joe reads his shared key
        Map<String, Object> joesKeyResult = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("keys/joe@imagey.cloud")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + joeToken.token())
            .get(new GenericType<Map<String, Object>>() { });
        assertThat(joesKeyResult).contains(entry("sharedKey", "joes-shared-key"));
    }

    @Test
    @DisplayName("Upload document without optional parts")
    public void uploadDocumentWithoutOptionals() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);
        String documentId = "new-doc-id";

        MetadataMap<String, String> metadataHeaders = new MetadataMap<>();
        metadataHeaders.putSingle("Content-Disposition", "form-data; name=\"metadata\"; filename=\"metadata.json\"");
        metadataHeaders.putSingle("Content-Type", "application/json");
        MetadataMap<String, String> sharedKeyHeaders = new MetadataMap<>();
        sharedKeyHeaders.putSingle("Content-Disposition", "form-data; name=\"sharedKey\"; filename=\"sharedKey.json\"");
        sharedKeyHeaders.putSingle("Content-Type", "application/json");
        MetadataMap<String, String> contentHeaders = new MetadataMap<>();
        contentHeaders.putSingle("Content-Disposition", "form-data; name=\"content\"; filename=\"content.bin\"");
        contentHeaders.putSingle("Content-Type", "application/octet-stream");

        List<Attachment> attachments = List.of(
            new Attachment(metadataHeaders, """
                {
                    "documentId": "%s",
                    "encryptedData": "dummy-encrypted-data"
                }
            """.formatted(documentId)),
            new Attachment(sharedKeyHeaders, """
                {
                    "issuer":"mary@imagey.cloud",
                    "kid":"0",
                    "sharedKey":"dummy-shared-key"
                }
            """),
            new Attachment(contentHeaders, new byte[] {1, 2, 3})
        );

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @Test
    @DisplayName("Upload document with optional parts")
    public void uploadDocumentWithOptionals() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);
        String documentId = "new-doc-with-optionals-id";

        List<Attachment> attachments = List.of(
            new Attachment("metadata", "application/json", """
                {
                    "documentId": "%s",
                    "smallImageId": "small-img",
                    "previewImageId": "preview-img",
                    "encryptedData": "dummy-encrypted-data"
                }
            """.formatted(documentId)),
            new Attachment("sharedKey", "application/json", """
                {
                    "issuer":"mary@imagey.cloud",
                    "kid":"0",
                    "sharedKey":"dummy-shared-key"
                }
            """),
            new Attachment("content", "application/octet-stream", new byte[] {1, 2, 3}),
            new Attachment("smallImage", "application/octet-stream", new byte[] {4, 5, 6}),
            new Attachment("previewImage", "application/octet-stream", new byte[] {7, 8, 9})
        );

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @Test
    @DisplayName("Load non-existent content returns 404")
    public void testGetNonExistentContent() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/non-existent-content")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get();
        assertThat(response.getStatus()).isEqualTo(404);
    }

    @Test
    @DisplayName("Load non-existent shared key returns 404")
    public void testGetNonExistentKey() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/unknown@imagey.cloud")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .get();
        assertThat(response.getStatus()).isEqualTo(404);
    }

    @Test
    @DisplayName("Upload document when document home does not exist")
    public void testUploadWithoutDocumentHome() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);
        String documentId = "doc-home-creation-test-id";

        // Delete documents home directory to trigger creation
        File marysDocuments = new File(new File(rootPath, "mary@imagey.cloud"), "documents");
        if (marysDocuments.exists()) {
            deleteDirectory(marysDocuments);
        }

        List<Attachment> attachments = List.of(
            new Attachment("metadata", "application/json", """
                {
                    "documentId": "%s",
                    "encryptedData": "dummy-encrypted-data"
                }
            """.formatted(documentId)),
            new Attachment("sharedKey", "application/json", """
                {
                    "issuer":"mary@imagey.cloud",
                    "kid":"0",
                    "sharedKey":"dummy-shared-key"
                }
            """),
            new Attachment("content", "application/octet-stream", new byte[] {1, 2, 3})
        );

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + token.token())
            .post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @BeforeEach
    @Test
    void testHasSharedKey() throws Exception {
        cloud.imagey.domain.user.User mary = new cloud.imagey.domain.user.User(
            new cloud.imagey.domain.mail.Email("mary@imagey.cloud"));
        cloud.imagey.domain.mail.Email unknown = new cloud.imagey.domain.mail.Email("unknown@imagey.cloud");
        cloud.imagey.domain.document.DocumentId docId = new cloud.imagey.domain.document.DocumentId(
            "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3");

        java.io.File keyFile = new java.io.File(rootPath
            + "/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/mary@imagey.cloud/"
            + "encrypted-shared.key");
        keyFile.getParentFile().mkdirs();
        java.nio.file.Files.writeString(keyFile.toPath(), "{}");

        assertThat(documentRepository.hasSharedKey(mary, docId, mary.email())).isTrue();
        assertThat(documentRepository.hasSharedKey(mary, docId, unknown)).isFalse();
    }

    @Test
    @DisplayName("Load documents when document home does not exist")
    public void testFindMetadataWithoutDocumentHome() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            org.apache.commons.io.FileUtils.deleteDirectory(data);
        }

        List<Map<String, Object>> metadata = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .request()
            .header("Origin", "https://secure-doc.store")
            .header("Cookie", "token=" + tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE).token())
            .get(new GenericType<List<Map<String, Object>>>() { });

        assertThat(metadata).isEmpty();
    }

    @BeforeEach
    void initializeDefaultState() throws URISyntaxException, IOException {
        File joesData = new File("./" + rootPath, "joe@imagey.cloud");
        if (joesData.exists()) {
            forceDelete(joesData);
        }

        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDevices = new File(marysData, "devices");
        File marysCreatedDevice = new File(marysDevices, "123e4567-e89b-12d3-a456-426655440000");
        if (marysCreatedDevice.exists()) {
            forceDelete(marysCreatedDevice);
        }
        File marysDocuments = new File(marysData, "documents");
        if (marysDocuments.exists()) {
            stream(marysDocuments.listFiles())
                .filter(f -> !of("bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3", "f9910aa7-4db6-4b02-b596-c3ccf872ae98").contains(f.getName()))
                .forEach(file -> {
                    try {
                        forceDelete(file);
                    } catch (IOException e) {
                        throw new IllegalStateException(e);
                    }
                });
        }
    }
}
