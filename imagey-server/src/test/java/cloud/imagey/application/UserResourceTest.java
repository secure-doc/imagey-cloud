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
import static jakarta.ws.rs.core.Response.Status.FORBIDDEN;
import static jakarta.ws.rs.core.Response.Status.OK;
import static java.lang.Integer.MAX_VALUE;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
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

import cloud.imagey.UserFactory;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.junit.GreenMail;

// Covers UserResource#registerUser: the self-registration guard (the authenticated principal may
// only register an account for their own userId) plus a happy path that exercises the new
// RegistrationMetadata deserialization and the toRegistration mapper end to end. The Pact contract
// only asserts a 200, so the field-level wiring is checked here.
@GreenMail
@MonoMeecrowaveConfig
public class UserResourceTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    private static final String BOUNDARY = "----ImageyTestBoundary";
    private static final String PUBLIC_KEY = "{\"crv\":\"P-256\",\"ext\":true,\"key_ops\":[],\"kty\":\"EC\","
        + "\"x\":\"OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY\","
        + "\"y\":\"D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM\"}";

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
        deleteQuietly(new File(data, UserFactory.JOE_ID.id()));
    }

    @Test
    @DisplayName("A user cannot register an account for someone else's userId")
    public void registerDifferentUserIdFails() {
        Response response = register("00000000-0000-0000-0000-00000000dead");

        assertThat(response.getStatus()).isEqualTo(FORBIDDEN.getStatusCode());
    }

    @Test
    @DisplayName("Registration stores the account keys and all four bootstrapped documents")
    public void registerStoresAccountAndDocuments() {
        String joe = UserFactory.JOE_ID.id();
        Response response = register(joe);

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());

        File joesData = new File(rootPath, joe);
        assertThat(new File(joesData, "public-keys/0.json")).exists();
        assertThat(new File(joesData, "devices/2d9e9f58-2f39-408a-b3d7-e66e6a431b45/public-keys/0.json")).exists();
        assertThat(new File(joesData, "devices/2d9e9f58-2f39-408a-b3d7-e66e6a431b45/private-keys/0.json")).exists();
        // Settings is filed under the user's own userId, the other three under their client-generated ids.
        assertDocument(joesData, joe, "0");
        assertDocument(joesData, "22222222-2222-2222-2222-222222222222", joe);
        assertDocument(joesData, "33333333-3333-3333-3333-333333333333", joe);
        assertDocument(joesData, "44444444-4444-4444-4444-444444444444", joe);
    }

    private static void assertDocument(File userData, String documentId, String keyKid) {
        File document = new File(userData, "documents/" + documentId);
        assertThat(new File(document, "metadata.enc")).exists();
        assertThat(new File(document, "keys/" + keyKid + ".json")).exists();
    }

    private Response register(String userId) {
        Cookie joesToken = new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(UserFactory.joe(), MAX_VALUE).token())
            .build();

        String contentType = "multipart/form-data; boundary=" + BOUNDARY;
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users")
            .request()
            .header("Origin", "https://secure-doc.store")
            .cookie(joesToken)
            .post(entity(registrationBody(userId), contentType));
    }

    private static String registrationBody(String userId) {
        String metadata = "{"
            + "\"userId\":\"" + userId + "\","
            + "\"deviceId\":\"2d9e9f58-2f39-408a-b3d7-e66e6a431b45\","
            + "\"devicePublicKey\":" + PUBLIC_KEY + ","
            + "\"mainPublicKey\":" + PUBLIC_KEY + ","
            + "\"encryptedPrivateKey\":\"dummy-private-key\","
            + "\"settingsKey\":{\"issuer\":\"" + userId + "\",\"kid\":\"0\",\"sharedKey\":\"AAAA\"},"
            + "\"documentList\":{\"id\":\"22222222-2222-2222-2222-222222222222\","
            + "\"key\":{\"issuer\":\"" + userId + "\",\"kid\":\"" + userId + "\",\"sharedKey\":\"AAAA\"}},"
            + "\"chatList\":{\"id\":\"33333333-3333-3333-3333-333333333333\","
            + "\"key\":{\"issuer\":\"" + userId + "\",\"kid\":\"" + userId + "\",\"sharedKey\":\"AAAA\"}},"
            + "\"profile\":{\"id\":\"44444444-4444-4444-4444-444444444444\","
            + "\"key\":{\"issuer\":\"" + userId + "\",\"kid\":\"" + userId + "\",\"sharedKey\":\"AAAA\"}}"
            + "}";
        return jsonPart("metadata", metadata)
            + binaryPart("settings", "0")
            + binaryPart("documentList", "0")
            + binaryPart("chatList", "0")
            + binaryPart("profile", "0")
            + "--" + BOUNDARY + "--\r\n";
    }

    private static String jsonPart(String name, String json) {
        return "--" + BOUNDARY + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"\r\n"
            + "Content-Type: application/json\r\n\r\n"
            + json + "\r\n";
    }

    private static String binaryPart(String name, String value) {
        return "--" + BOUNDARY + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"\r\n"
            + "Content-Type: application/octet-stream\r\n\r\n"
            + value + "\r\n";
    }
}
