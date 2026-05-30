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

import static java.lang.Integer.MAX_VALUE;
import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.entity;
import static jakarta.ws.rs.core.MediaType.MULTIPART_FORM_DATA_TYPE;
import static jakarta.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.List;

import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;

import org.apache.cxf.jaxrs.ext.multipart.Attachment;
import org.apache.cxf.jaxrs.ext.multipart.MultipartBody;
import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;

@MonoMeecrowaveConfig
public class ProfileTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    @Test
    @DisplayName("Upload profile picture")
    public void uploadProfilePicture() throws IOException {
        // Given
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);

        List<Attachment> attachments = List.of(
            new Attachment("metadata", "application/json", """
                {
                    "documentId": "profile",
                    "smallImageId": "small-img",
                    "previewImageId": "preview-img",
                    "encryptedData": "dummy-encrypted-profile-data"
                }
            """),
            new Attachment("sharedKey", "application/json", """
                {
                    "key": "dummy-shared-key"
                }
            """),
            new Attachment("content", "application/octet-stream", new byte[] {1, 2, 3}),
            new Attachment("smallImage", "application/octet-stream", new byte[] {4, 5, 6}),
            new Attachment("previewImage", "application/octet-stream", new byte[] {7, 8, 9})
        );

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/profile")
            .request()
            .header("Cookie", "token=" + token.token())
            .put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        // Then
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Also verify that the files actually exist on disk
        File marysData = new File(rootPath, "mary@imagey.cloud");
        File profileDocumentDir = new File(marysData, "documents/profile");
        assertThat(new File(profileDocumentDir, "meta-data")).exists();
        assertThat(new File(profileDocumentDir, "contents/profile")).exists(); // the actual content
    }

    @Test
    @DisplayName("Get Profile")
    public void getProfile() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);

        // Upload profile first
        List<Attachment> attachments = List.of(
            new Attachment("metadata", "application/json", """
                {
                    "documentId": "profile",
                    "encryptedData": "dummy-encrypted-profile-data"
                }
            """),
            new Attachment("sharedKey", "application/json", """
                {
                    "key": "dummy-shared-key"
                }
            """),
            new Attachment("content", "application/octet-stream", new byte[] {1, 2, 3})
        );
        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/profile")
            .request()
            .header("Cookie", "token=" + token.token())
            .put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/profile")
            .request()
            .header("Cookie", "token=" + token.token())
            .get();

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @Test
    @DisplayName("Upload Profile Twice")
    public void testUploadProfileTwice() throws IOException {
        Token token = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);

        List<Attachment> attachments = List.of(
            new Attachment("metadata", "application/json", """
                {
                    "documentId": "profile",
                    "encryptedData": "dummy-encrypted-profile-data"
                }
            """),
            new Attachment("sharedKey", "application/json", """
                {
                    "key": "dummy-shared-key"
                }
            """),
            new Attachment("content", "application/octet-stream", new byte[] {1, 2, 3})
        );

        // First upload (creates the profile directory)
        newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/profile")
            .request()
            .header("Cookie", "token=" + token.token())
            .put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        // Second upload (triggers deleteDocument because it already exists)
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/profile")
            .request()
            .header("Cookie", "token=" + token.token())
            .put(entity(new MultipartBody(attachments), MULTIPART_FORM_DATA_TYPE));

        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
    }

    @BeforeEach
    void initializeDefaultState() throws URISyntaxException, IOException {
        File marysData = new File(rootPath, "mary@imagey.cloud");
        File profileDocumentDir = new File(marysData, "documents/profile");
        if (profileDocumentDir.exists()) {
            forceDelete(profileDocumentDir);
        }
    }
}
