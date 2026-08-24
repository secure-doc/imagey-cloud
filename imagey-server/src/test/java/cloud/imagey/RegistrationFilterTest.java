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
import static jakarta.ws.rs.core.Response.Status.FORBIDDEN;
import static jakarta.ws.rs.core.Response.Status.FOUND;
import static java.lang.Integer.MAX_VALUE;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.util.Optional;

import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

// Exercises RegistrationFilter (/registrations/*), the GET half of the registration flow that turns
// a verification-mail token into an account plus an auth-cookie redirect. The POST /users half is
// covered by the Pact contract; the mail that carries the token is covered by LoginTest.
@GreenMail
@MonoMeecrowaveConfig
public class RegistrationFilterTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");

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
        // Joe must not exist yet - registration is what creates his account.
        deleteQuietly(new File(data, "joe@imagey.cloud"));
    }

    @Test
    @DisplayName("Registration with a valid token creates the account and redirects with an auth cookie")
    public void registrationWithValidToken() throws IOException {
        Token registrationToken = tokenService.generateToken(new User(new Email("joe@imagey.cloud")), MAX_VALUE);

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/registrations/" + registrationToken.token())
            .request().header("Origin", "https://secure-doc.store")
            .get();

        assertThat(response.getStatus()).isEqualTo(FOUND.getStatusCode());
        assertThat(response.getLocation()).isNotNull();
        assertThat(response.getLocation().toString()).contains("email=joe");

        String setCookie = response.getHeaderString("Set-Cookie");
        assertThat(setCookie).startsWith("token=");
        String tokenValue = setCookie.substring("token=".length(), setCookie.indexOf(';'));
        Optional<DecodedToken> decoded = tokenService.decode(new Token(tokenValue));
        assertThat(decoded).get().extracting(t -> t.jwt().getSubject()).isEqualTo("joe@imagey.cloud");

        assertThat(new File(rootPath, "joe@imagey.cloud")).exists();
    }

    @Test
    @DisplayName("Registration for an already registered user still redirects (create is idempotent)")
    public void registrationForExistingUser() {
        Token registrationToken = tokenService.generateToken(new User(new Email("mary@imagey.cloud")), MAX_VALUE);

        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/registrations/" + registrationToken.token())
            .request().header("Origin", "https://secure-doc.store")
            .get();

        assertThat(response.getStatus()).isEqualTo(FOUND.getStatusCode());
        assertThat(response.getLocation().toString()).contains("email=mary");
    }

    @Test
    @DisplayName("Registration with an invalid token is rejected")
    public void registrationWithInvalidToken() {
        Response response = newClient()
            .target("http://localhost:" + config.getHttpPort() + "/registrations/invalid.token.value")
            .request().header("Origin", "https://secure-doc.store")
            .get();

        assertThat(response.getStatus()).isEqualTo(FORBIDDEN.getStatusCode());
    }
}
