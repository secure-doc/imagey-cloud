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
public class FrontendFilterTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Test
    @DisplayName("Verify frontend routes are forwarded to index.html")
    public void testFrontendRouteForward() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("chats")
            .request()
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        String html = response.readEntity(String.class);
        assertThat(html).contains("<html");
        assertThat(html).contains("id=\"root\"");
    }

    @Test
    @DisplayName("Verify static files are not forwarded")
    public void testStaticFile() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("favicon.ico")
            .request()
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        // Since favicon is not HTML, it shouldn't be the index.html content
        String content = response.readEntity(String.class);
        assertThat(content).doesNotContain("<html");
    }

    @Test
    @DisplayName("Verify API endpoints are not forwarded")
    public void testApiEndpoint() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users")
            .request()
            // We just need to check if it reaches the API, even if it returns 401/403
            .get();

        // Users endpoint returns 405 Method Not Allowed or 403 Forbidden without auth
        assertThat(response.getStatus()).isNotEqualTo(OK.getStatusCode());
        String content = response.readEntity(String.class);
        assertThat(content).doesNotContain("<html");
    }
}
