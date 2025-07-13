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
import static java.math.BigDecimal.valueOf;
import static java.util.Arrays.stream;
import static java.util.Set.of;
import static javax.ws.rs.client.ClientBuilder.newClient;
import static javax.ws.rs.client.Entity.entity;
import static javax.ws.rs.client.Entity.json;
import static javax.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM_TYPE;
import static javax.ws.rs.core.MediaType.TEXT_PLAIN_TYPE;
import static javax.ws.rs.core.Response.Status.Family.SUCCESSFUL;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Map;

import javax.inject.Inject;
import javax.ws.rs.core.GenericType;
import javax.ws.rs.core.Response;

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
public class DocumentTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

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
        String sharedKey = "alkdjföalsdjkföa";

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("meta-data")
            .request()
            .header("Cookie", "token=" + token.token())
            .put(json("""
                {
                    "name": "file.png",
                    "type": "image/png",
                    "size": %d,
                    "documentId": "%s",
                    "smallImageId": "%s",
                    "previewImageId": "%s"                }
            """.formatted(documentContent.length, documentId, smallImageId, previewImageId)));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("contents")
                .path(documentId)
                .request()
                .header("Cookie", "token=" + token.token())
                .put(entity(documentContent, APPLICATION_OCTET_STREAM_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("contents")
                .path(smallImageId)
                .request()
                .header("Cookie", "token=" + token.token())
                .put(entity(smallContent, APPLICATION_OCTET_STREAM_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("contents")
                .path(previewImageId)
                .request()
                .header("Cookie", "token=" + token.token())
                .put(entity(previewContent, APPLICATION_OCTET_STREAM_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);
        response = newClient()
                .target("http://localhost:" + config.getHttpPort())
                .path("users/mary@imagey.cloud/documents/")
                .path(documentId)
                .path("encrypted-shared-keys/mary@imagey.cloud")
                .request()
                .header("Cookie", "token=" + token.token())
                .put(entity(sharedKey, TEXT_PLAIN_TYPE));
        assertThat(response.getStatusInfo().getFamily()).isEqualTo(SUCCESSFUL);

        // Then
        List<Map<String, Object>> metadatas = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .request()
            .header("Cookie", "token=" + token.token())
            .get(new GenericType<List<Map<String, Object>>>() { });
        Map<String, Object> metadata = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents")
            .path(documentId)
            .path("meta-data")
            .request()
            .header("Cookie", "token=" + token.token())
            .get(new GenericType<Map<String, Object>>() { });
        assertThat(metadatas).contains(metadata);
        assertThat(metadata).contains(
            entry("name", "file.png"),
            entry("type", "image/png"),
            entry("size", valueOf(6)),
            entry("documentId", documentId),
            entry("smallImageId", smallImageId),
            entry("previewImageId", previewImageId));
        byte[] actualDocumentContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("contents")
            .path(documentId)
            .request()
            .header("Cookie", "token=" + token.token())
            .get(byte[].class);
        byte[] actualSmallImageContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("contents")
            .path(smallImageId)
            .request()
            .header("Cookie", "token=" + token.token())
            .get(byte[].class);
        byte[] actualPreviewImageContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/documents/")
            .path(documentId)
            .path("contents")
            .path(previewImageId)
            .request()
            .header("Cookie", "token=" + token.token())
            .get(byte[].class);
        assertThat(actualDocumentContent).isEqualTo(documentContent);
        assertThat(actualSmallImageContent).isEqualTo(smallContent);
        assertThat(actualPreviewImageContent).isEqualTo(previewContent);
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
