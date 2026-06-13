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
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@MonoMeecrowaveConfig
public class ManifestFilterTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Test
    @DisplayName("Verify Manifest contains Imagey when Origin is imagey.cloud")
    public void testGetManifestForImagey() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("manifest.json")
            .request().header("Origin", "https://imagey.cloud")
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        String json = response.readEntity(String.class);
        assertThat(json).contains("\"id\": \"imagey\"");
        assertThat(json).contains("\"name\": \"Imagey - Your image vault\"");
        assertThat(json).contains("\"short_name\": \"Imagey\"");
        assertThat(json).contains("\"start_url\": \"https://imagey.cloud\"");
    }

    @Test
    @DisplayName("Verify Manifest contains Secure Doc when Origin is secure-doc.store")
    public void testGetManifestForSecureDoc() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("manifest.json")
            .request().header("Origin", "https://secure-doc.store")
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        String json = response.readEntity(String.class);
        assertThat(json).contains("\"id\": \"secure-doc\"");
        assertThat(json).contains("\"name\": \"Secure Doc - Your image vault\"");
        assertThat(json).contains("\"short_name\": \"Secure Doc\"");
        assertThat(json).contains("\"start_url\": \"https://secure-doc.store\"");
    }
}
