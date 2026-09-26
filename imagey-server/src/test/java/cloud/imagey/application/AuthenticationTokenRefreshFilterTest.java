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
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.util.Optional;

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
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.User;

// Covers AuthenticationTokenRefreshFilter: an aging trusted session cookie is slid forward on
// activity, a fresh one is left alone, and an untrusted (email-link) cookie is never extended.
@MonoMeecrowaveConfig
public class AuthenticationTokenRefreshFilterTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    private final User mary = UserFactory.mary();

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        deleteQuietly(data);
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @Test
    @DisplayName("An aging trusted session cookie is re-issued on activity")
    void agingTrustedCookieIsRefreshed() {
        String cookie = requestPublicKey(trustedCookie(TokenService.ONE_HOUR)).getHeaderString("Set-Cookie");

        assertThat(cookie)
            .contains("token=")
            .contains("Max-Age=" + TokenService.TRUSTED_COOKIE_MAX_AGE_SECONDS);
    }

    @Test
    @DisplayName("A freshly issued trusted cookie is not re-issued again")
    void freshTrustedCookieIsNotRefreshed() {
        assertThat(requestPublicKey(trustedCookie(TokenService.ONE_MONTH)).getHeaderString("Set-Cookie")).isNull();
    }

    @Test
    @DisplayName("An untrusted session cookie is never extended")
    void untrustedCookieIsNotRefreshed() {
        Cookie untrusted = new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(mary, TokenService.ONE_HOUR, false).token())
            .build();

        assertThat(requestPublicKey(untrusted).getHeaderString("Set-Cookie")).isNull();
    }

    @Test
    @DisplayName("The device a session is bound to is carried over when the cookie is re-issued")
    void deviceClaimSurvivesRefresh() {
        DeviceId device = new DeviceId("device-1");
        Cookie bound = new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(mary, TokenService.ONE_HOUR, true, Optional.of(device)).token())
            .build();

        assertThat(refreshedToken(requestPublicKey(bound)).device()).contains(device);
        assertThat(refreshedToken(requestPublicKey(trustedCookie(TokenService.ONE_HOUR))).device()).isEmpty();
    }

    private DecodedToken refreshedToken(Response response) {
        String cookie = response.getHeaderString("Set-Cookie");
        String value = cookie.substring("token=".length(), cookie.indexOf(';'));
        return tokenService.decode(new Token(value)).orElseThrow();
    }

    private Cookie trustedCookie(long validity) {
        return new Cookie.Builder("token")
            .value(tokenService.generateAuthenticationToken(mary, validity, true).token())
            .build();
    }

    private Response requestPublicKey(Cookie cookie) {
        return newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users").path(mary.id().id()).path("public-keys").path("0")
            .request()
            .cookie(cookie)
            .get();
    }
}
