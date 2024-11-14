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
import static javax.ws.rs.core.Response.Status.NOT_FOUND;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;

import javax.inject.Inject;
import javax.ws.rs.core.Response;

import org.apache.commons.io.FileUtils;
import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import jakarta.mail.MessagingException;

@MonoMeecrowaveConfig
public class AcmeChallengeTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "acme-challenge.path")
    private String challengePath;

    @Test
    void getAcmeChallenge() throws IOException, MessagingException {
        // Given
        File file = new File(challengePath, "test-challenge");
        FileUtils.write(file, "test-content", Charset.forName("UTF-8"));

        // When
        String testContent = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path(".well-known/acme-challenge")
            .path("test-challenge")
            .request()
            .get(String.class);

        // Then
        assertThat(testContent).isEqualTo("test-content");
    }

    @Test
    void dontAllowSubnavigation() throws IOException, MessagingException {
        // Given
        File file = new File(challengePath, "test-challenge");
        FileUtils.write(file, "test-content", Charset.forName("UTF-8"));

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path(".well-known/acme-challenge")
            .path("test/challenge")
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
    }

    @Test
    void dontAllowUpnavigation() throws IOException, MessagingException {
        // Given
        File file = new File(challengePath, "test-challenge");
        FileUtils.write(file, "test-content", Charset.forName("UTF-8"));

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path(".well-known/acme-challenge")
            .path("../challenge")
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
    }

    @Test
    void nonExistingFile() throws IOException, MessagingException {
        // Given
        File file = new File(challengePath, "test-challenge");
        assertThat(file.exists()).isEqualTo(false);

        // When
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path(".well-known/acme-challenge")
            .path("test-challenge")
            .request()
            .get();

        // Then
        assertThat(response.getStatus()).isEqualTo(NOT_FOUND.getStatusCode());
    }

    @AfterEach
    void deleteFiles() throws IOException {
        File file = new File(challengePath, "test-challenge");
        if (file.exists()) {
            forceDelete(file);
        }
    }
}
