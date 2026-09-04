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
import static jakarta.ws.rs.core.Response.Status.OK;
import static jakarta.ws.rs.core.Response.Status.UNAUTHORIZED;
import static java.lang.Integer.MAX_VALUE;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

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

import cloud.imagey.UserFactory;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

// Drives RolesFilter#hasRole through the "member" branch (direct key issuer + recursive folder
// chain), the negative case, the now owner-only public-key endpoint, and the anonymous short-circuit.
// "owner" is exercised throughout the rest of the suite.
@GreenMail
@MonoMeecrowaveConfig
public class RolesFilterTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;

    private final User mary = UserFactory.mary();
    private final User laura = UserFactory.laura();

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
        deleteQuietly(new File(data, mary.id().id() + "/contact-requests"));
        deleteQuietly(new File(data, laura.id().id() + "/contact-requests"));
    }

    @Test
    @DisplayName("A user who issued a key filed under a document has the member role")
    void keyIssuerHasMemberRole() {
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        documentRepository.persist(mary, documentId, new EncryptedContent("{}".getBytes()));
        documentRepository.create(mary, documentId, sharedKey(laura, laura.id().id()));

        assertThat(getDocumentAs(mary, documentId, laura).getStatus()).isEqualTo(OK.getStatusCode());
    }

    @Test
    @DisplayName("A member of a folder reaches a document nested in it when they assert the Access-Path chain")
    void memberOfFolderReachesNestedDocument() {
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        documentRepository.persist(mary, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(mary, folder, sharedKey(laura, laura.id().id()));
        documentRepository.persist(mary, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(mary, documentId, sharedKey(mary, folder.id()));

        String chain = accessPath(
            hop(documentId, mary, folder),
            hop(folder, mary, folder));

        assertThat(getDocumentAs(mary, documentId, laura, chain).getStatus()).isEqualTo(OK.getStatusCode());
    }

    @Test
    @DisplayName("Without the Access-Path chain a folder member is denied a document merely nested in it")
    void nestedDocumentWithoutChainIsDenied() {
        DocumentId folder = new DocumentId("folder-" + UUID.randomUUID());
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        documentRepository.persist(mary, folder, new EncryptedContent("folder".getBytes()));
        documentRepository.create(mary, folder, sharedKey(laura, laura.id().id()));
        documentRepository.persist(mary, documentId, new EncryptedContent("doc".getBytes()));
        documentRepository.create(mary, documentId, sharedKey(mary, folder.id()));

        assertThat(getDocumentAs(mary, documentId, laura).getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("A malformed Access-Path header is a 400")
    void malformedAccessPathHeader() {
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        documentRepository.persist(mary, documentId, new EncryptedContent("{}".getBytes()));

        assertThat(getDocumentAs(mary, documentId, laura, "not-base64url!!").getStatus()).isEqualTo(400);
    }

    @Test
    @DisplayName("A user without a key in the document's chain is denied the member role")
    void nonMemberIsDenied() {
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        documentRepository.persist(mary, documentId, new EncryptedContent("{}".getBytes()));

        assertThat(getDocumentAs(mary, documentId, laura).getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("A previously denied user is allowed once a key for them is added (negatives are not cached)")
    void deniedThenGrantedAfterKeyIsAdded() {
        DocumentId documentId = new DocumentId(UUID.randomUUID().toString());
        documentRepository.persist(mary, documentId, new EncryptedContent("{}".getBytes()));

        assertThat(getDocumentAs(mary, documentId, laura).getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());

        documentRepository.create(mary, documentId, sharedKey(laura, laura.id().id()));

        assertThat(getDocumentAs(mary, documentId, laura).getStatus()).isEqualTo(OK.getStatusCode());
    }

    @Test
    @DisplayName("Another user cannot read the owner's public key")
    void publicKeyIsOwnerOnly() {
        assertThat(marysPublicKeyAs(laura).getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    @Test
    @DisplayName("An anonymous request (no token) is rejected from a secured resource")
    void anonymousRequestIsRejected() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(mary.id().id()).path("public-keys").path("0")
            .request()
            .get();

        assertThat(response.getStatus()).isEqualTo(UNAUTHORIZED.getStatusCode());
    }

    private Response getDocumentAs(User owner, DocumentId documentId, User caller) {
        return getDocumentAs(owner, documentId, caller, null);
    }

    private Response getDocumentAs(User owner, DocumentId documentId, User caller, String accessPath) {
        var request = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(owner.id().id()).path("documents").path(documentId.id())
            .request()
            .cookie(tokenCookie(caller));
        if (accessPath != null) {
            request = request.header("Access-Path", accessPath);
        }
        return request.get();
    }

    private static String hop(DocumentId doc, User owner, DocumentId wrappedBy) {
        return "{\"doc\":\"" + doc.id() + "\",\"owner\":\"" + owner.id().id()
            + "\",\"wrappedBy\":\"" + wrappedBy.id() + "\"}";
    }

    private static String accessPath(String... hops) {
        String json = "{\"chain\":[" + String.join(",", hops) + "]}";
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    private Response marysPublicKeyAs(User caller) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(mary.id().id()).path("public-keys").path("0")
            .request()
            .cookie(tokenCookie(caller))
            .get();
    }

    private Cookie tokenCookie(User user) {
        return new Cookie.Builder("token").value(tokenService.generateAuthenticationToken(user, MAX_VALUE).token()).build();
    }

    private static EncryptedSharedKey sharedKey(User issuer, String kid) {
        return new EncryptedSharedKey(issuer, new Kid(kid), new EncryptedSymmetricKey("d3JhcHBlZA=="));
    }
}
