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

import static javax.ws.rs.client.ClientBuilder.newClient;
import static javax.ws.rs.client.Entity.json;
import static javax.ws.rs.core.Response.Status.SERVICE_UNAVAILABLE;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;

import javax.inject.Inject;
import javax.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import jakarta.mail.MessagingException;

@MonoMeecrowaveConfig
public class EmailTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Test
    public void emailServerNotAccessible() throws IOException, MessagingException {
        // Given
        String newUser = """
                {
                    "email": "joe@imagey.cloud"
                }
            """;

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users")
            .request()
            .post(json(newUser));

        // Then
        assertThat(response.getStatus()).isEqualTo(SERVICE_UNAVAILABLE.getStatusCode());
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
    }
}
