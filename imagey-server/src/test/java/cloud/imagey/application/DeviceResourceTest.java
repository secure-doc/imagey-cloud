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
import static jakarta.ws.rs.client.Entity.json;
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.NOT_FOUND;
import static jakarta.ws.rs.core.Response.Status.OK;
import static java.lang.Integer.MAX_VALUE;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.copyURLToFile;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.io.StringReader;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonValue;
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

import cloud.imagey.UserFactory;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.junit.GreenMail;

// Covers the device list (activation status and encrypted info, ADR 0017) and storing a device's
// info. The Pact contract pins the happy paths; the guards against phantom devices and malformed
// infos are checked here.
@GreenMail
@MonoMeecrowaveConfig
public class DeviceResourceTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    private static final String MARY = UserFactory.MARY_ID.id();
    private static final String FIRST_DEVICE = "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c";
    private static final String SECOND_DEVICE = "00b7d225-202c-4ab9-8efc-36e6f3afb169";

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
        // A second device that is registered, but neither activated nor described yet.
        copyURLToFile(
            DeviceResourceTest.class.getResource("/second-device-public-key.json"),
            new File(secondDevice(), "public-keys/0.json"));
    }

    @Test
    @DisplayName("The device list tells activated devices and carries their encrypted infos")
    public void listDevices() {
        Response response = request("").get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        Map<String, JsonObject> devices = parseArray(response.readEntity(String.class)).stream()
            .map(JsonValue::asJsonObject)
            .collect(Collectors.toMap(device -> device.getString("deviceId"), device -> device));
        assertThat(devices).containsOnlyKeys(FIRST_DEVICE, SECOND_DEVICE);
        assertThat(devices.get(FIRST_DEVICE).getBoolean("activated")).isTrue();
        assertThat(devices.get(FIRST_DEVICE).getJsonObject("publicKey").getString("kty")).isEqualTo("EC");
        assertThat(devices.get(FIRST_DEVICE).getString("info")).startsWith("Dd/0ORVB");
        assertThat(devices.get(SECOND_DEVICE).getBoolean("activated")).isFalse();
        assertThat(devices.get(SECOND_DEVICE)).doesNotContainKey("info");
    }

    @Test
    @DisplayName("Storing a device's info replaces the previous one")
    public void storeDeviceInfo() {
        assertThat(request("/" + SECOND_DEVICE + "/info").put(json("\"Zmlyc3Q=\"")).getStatus())
            .isEqualTo(OK.getStatusCode());
        assertThat(request("/" + SECOND_DEVICE + "/info").put(json("\"cmVuYW1lZA==\"")).getStatus())
            .isEqualTo(OK.getStatusCode());

        assertThat(new File(secondDevice(), "info.txt")).hasContent("cmVuYW1lZA==");
    }

    @Test
    @DisplayName("The info of an unregistered device is rejected, so no phantom device appears")
    public void storeInfoOfUnregisteredDevice() {
        Response response = request("/00000000-0000-0000-0000-000000000000/info").put(json("\"AAAA\""));

        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
        assertThat(new File(rootPath, MARY + "/devices/00000000-0000-0000-0000-000000000000")).doesNotExist();
    }

    @Test
    @DisplayName("Only a base64 JSON string of bounded length is accepted as device info")
    public void storeMalformedDeviceInfo() {
        for (String body: new String[] {"{\"info\":\"AAAA\"}", "\"not base64!\"", "\"" + "A".repeat(4100) + "\"", "not json"}) {
            assertThat(request("/" + SECOND_DEVICE + "/info").put(json(body)).getStatus())
                .as(body)
                .isEqualTo(BAD_REQUEST.getStatusCode());
        }
        assertThat(new File(secondDevice(), "info.txt")).doesNotExist();
    }

    private File secondDevice() {
        return new File(rootPath, MARY + "/devices/" + SECOND_DEVICE);
    }

    private Invocation.Builder request(String path) {
        Cookie marysToken = new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(UserFactory.mary(), MAX_VALUE).token())
            .build();
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/" + MARY + "/devices" + path)
            .request()
            .header("Origin", "https://secure-doc.store")
            .cookie(marysToken);
    }

    private static JsonArray parseArray(String json) {
        try (JsonReader reader = Json.createReader(new StringReader(json))) {
            return reader.readArray();
        }
    }
}
