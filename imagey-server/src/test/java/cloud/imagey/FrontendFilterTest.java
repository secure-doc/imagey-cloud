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

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.core.Response.Status.OK;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.junit.jupiter.api.Test;

import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class FrontendFilterTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Test
    public void forwardFrontendDeepLinks() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("dashboard/settings")
            .request()
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.getHeaderString("Cache-Control")).contains("no-cache", "no-store", "must-revalidate");
        assertThat(response.getHeaderString("Pragma")).isEqualTo("no-cache");
    }

    @Test
    public void serveIndexHtml() throws IOException {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("index.html")
            .request()
            .get();

        assertThat(response.getStatus()).isEqualTo(OK.getStatusCode());
        assertThat(response.getHeaderString("Cache-Control")).contains("no-cache", "no-store", "must-revalidate");
        assertThat(response.getHeaderString("Pragma")).isEqualTo("no-cache");
    }
}
