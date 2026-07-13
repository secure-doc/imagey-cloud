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
import static jakarta.ws.rs.core.MediaType.MULTIPART_FORM_DATA_TYPE;
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import jakarta.inject.Inject;
import jakarta.ws.rs.client.Invocation.Builder;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.Response;

import org.apache.cxf.jaxrs.ext.multipart.Attachment;
import org.apache.cxf.jaxrs.ext.multipart.ContentDisposition;
import org.apache.cxf.jaxrs.ext.multipart.MultipartBody;
import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentMetadata;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class DocumentResourceTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;

    private Cookie userCookie;
    private User user;

    @BeforeEach
    void initializeState() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new Email("owner@example.com"));
        userCookie = new Cookie.Builder("token").value(tokenService.generateToken(user, Integer.MAX_VALUE).token()).build();
    }

    private Builder client() {
        return newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users").path(user.email().address()).path("documents")
                .request()
                .cookie(userCookie);
    }

    @Test
    @DisplayName("Missing metadata leads to 400")
    void missingMetadata() {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());

        Response response = client().post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    @Test
    @DisplayName("Missing issuer leads to 400")
    void missingIssuer() {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());

        Response response = client().post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    @Test
    @DisplayName("Missing key leads to 400")
    void missingKey() {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createIssuerAttachment());

        Response response = client().post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
    }

    @Test
    @DisplayName("Metadata without files is stored correctly")
    void metadataWithoutFiles() throws IOException {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());

        Response response = client().post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<DocumentMetadata> metadataList = documentRepository.findMetadata(user);
        assertThat(metadataList).hasSize(1);
    }

    @Test
    @DisplayName("Metadata with one file is stored correctly")
    void metadataWithOneFile() throws IOException {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());
        attachments.add(createFileAttachment("file1.txt", "content1"));

        Response response = client().post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<DocumentMetadata> metadataList = documentRepository.findMetadata(user);
        assertThat(metadataList).hasSize(1);
        DocumentId docId = metadataList.get(0).documentId();

        File filesDir = new File(new File(new File(rootPath, user.email().address()), "documents/" + docId.id()), "files");
        assertThat(filesDir).exists();
        assertThat(filesDir.listFiles()).hasSize(1);
    }

    @Test
    @DisplayName("Metadata with three files is stored correctly")
    void metadataWithThreeFiles() throws IOException {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());
        attachments.add(createFileAttachment("file1.txt", "content1"));
        attachments.add(createFileAttachment("file2.txt", "content2"));
        attachments.add(createFileAttachment("file3.txt", "content3"));

        Response response = client().post(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(CREATED.getStatusCode());

        List<DocumentMetadata> metadataList = documentRepository.findMetadata(user);
        assertThat(metadataList).hasSize(1);
        DocumentId docId = metadataList.get(0).documentId();

        File filesDir = new File(new File(new File(rootPath, user.email().address()), "documents/" + docId.id()), "files");
        assertThat(filesDir).exists();
        assertThat(filesDir.listFiles()).hasSize(3);
    }

    private Attachment createMetadataAttachment() {
        return new Attachment("metadata", new ByteArrayInputStream("{\"name\":\"test\"}".getBytes(StandardCharsets.UTF_8)),
            new ContentDisposition("form-data; name=\"metadata\""));
    }

    private Attachment createKeyAttachment() {
        return new Attachment("key", new ByteArrayInputStream("dummy-key".getBytes(StandardCharsets.UTF_8)),
            new ContentDisposition("form-data; name=\"key\""));
    }

    private Attachment createIssuerAttachment() {
        return new Attachment("issuer", new ByteArrayInputStream("issuer@example.com".getBytes(StandardCharsets.UTF_8)),
            new ContentDisposition("form-data; name=\"issuer\""));
    }

    private Attachment createFileAttachment(String filename, String content) {
        return new Attachment("files", new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)),
            new ContentDisposition("form-data; name=\"files\"; filename=\"" + filename + "\""));
    }
}
