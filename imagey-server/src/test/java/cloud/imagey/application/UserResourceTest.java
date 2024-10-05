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

import static org.assertj.core.api.Assertions.assertThat;

import javax.ws.rs.client.ClientBuilder;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.junit.jupiter.api.Test;

@MonoMeecrowaveConfig
public class UserResourceTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Test
    void greeting() {

        // When
        String response = ClientBuilder.newClient()
            .target("http://localhost:" + config.getActivePort())
            .path("users/max@imagey.cloud")
            .request()
            .get(String.class);

        // Then
        assertThat(response).isEqualTo("This is Imagey");
    }
}
