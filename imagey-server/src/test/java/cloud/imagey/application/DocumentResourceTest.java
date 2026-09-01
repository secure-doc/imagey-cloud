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
import static jakarta.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM;
import static java.util.UUID.randomUUID;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;

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
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.junit.GreenMail;

// Covers the metadata GET/PUT of DocumentResource. The multipart upload contract lives in
// DocumentUploadTest.
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

        user = new User(new UserId("owner@example.com"));
        userCookie = new Cookie.Builder("token").value(tokenService.generateAuthenticationToken(user, Integer.MAX_VALUE).token()).build();
    }

    @Test
    @DisplayName("Metadata can be updated")
    void updateMetadata() {
        DocumentId documentId = givenDocument();

        Response response = document(documentId)
            .put(entity(new byte[]{1, 2, 3}, APPLICATION_OCTET_STREAM));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(Response.Status.NO_CONTENT);
    }

    @Test
    @DisplayName("Metadata update fails with wrong ETag")
    void updateMetadataWrongEtag() {
        DocumentId documentId = givenDocument();

        Response response = document(documentId)
            .header("If-Match", "\"wrong\"")
            .put(entity(new byte[]{1, 2, 3}, APPLICATION_OCTET_STREAM));

        assertThat(response.getStatusInfo().toEnum()).isEqualTo(Response.Status.PRECONDITION_FAILED);
    }

    private DocumentId givenDocument() {
        DocumentId documentId = new DocumentId(randomUUID().toString());
        documentRepository.persist(user, documentId, new EncryptedContent("metadata".getBytes()));
        return documentId;
    }

    private jakarta.ws.rs.client.Invocation.Builder document(DocumentId documentId) {
        return newClient().target("http://localhost:" + config.getHttpPort())
            .path("users").path(user.id().id()).path("documents").path(documentId.id())
            .request()
            .cookie(userCookie);
    }
}
