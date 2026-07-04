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
import static jakarta.ws.rs.core.Response.Status.OK;
import static java.nio.charset.StandardCharsets.UTF_8;
import static java.util.Optional.empty;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
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

import cloud.imagey.domain.document.DocumentMetadata;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class ProfileResourceTest {

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
                .path("users").path(user.email().address()).path("profile")
                .request()
                .cookie(userCookie);
    }

    @Test
    @DisplayName("Upload profile document without small image")
    void uploadProfileWithoutSmallImage() {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());
        attachments.add(createContentAttachment());
        attachments.add(createPreviewImageAttachment());
        // omit small image

        Response response = client().put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());

        List<DocumentMetadata> metadataList = documentRepository.findMetadata(user, empty());
        assertThat(metadataList).hasSize(1);
    }

    @Test
    @DisplayName("Upload profile document without preview image")
    void uploadProfileWithoutPreviewImage() {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());
        attachments.add(createContentAttachment());
        attachments.add(createSmallImageAttachment());
        // omit preview image

        Response response = client().put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());

        List<DocumentMetadata> metadataList = documentRepository.findMetadata(user, empty());
        assertThat(metadataList).hasSize(1);
    }

    @Test
    @DisplayName("Upload profile document without any optional images")
    void uploadProfileWithoutOptionalImages() {
        List<Attachment> attachments = new ArrayList<>();
        attachments.add(createMetadataAttachment());
        attachments.add(createKeyAttachment());
        attachments.add(createIssuerAttachment());
        attachments.add(createContentAttachment());

        Response response = client().put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
    }

    private Attachment createMetadataAttachment() {
        return new Attachment("metadata", new ByteArrayInputStream("{\"name\":\"test\"}".getBytes(UTF_8)),
            new ContentDisposition("form-data; name=\"metadata\""));
    }

    private Attachment createKeyAttachment() {
        return new Attachment("key", new ByteArrayInputStream("dummy-key".getBytes(UTF_8)),
            new ContentDisposition("form-data; name=\"key\""));
    }

    private Attachment createIssuerAttachment() {
        return new Attachment("issuer", new ByteArrayInputStream("owner@example.com".getBytes(UTF_8)),
            new ContentDisposition("form-data; name=\"issuer\""));
    }

    private Attachment createContentAttachment() {
        return new Attachment("content", new ByteArrayInputStream("content".getBytes(UTF_8)),
            new ContentDisposition("form-data; name=\"content\""));
    }

    private Attachment createSmallImageAttachment() {
        return new Attachment("smallImage", new ByteArrayInputStream("small".getBytes(UTF_8)),
            new ContentDisposition("form-data; name=\"smallImage\""));
    }

    private Attachment createPreviewImageAttachment() {
        return new Attachment("previewImage", new ByteArrayInputStream("preview".getBytes(UTF_8)),
            new ContentDisposition("form-data; name=\"previewImage\""));
    }
}
