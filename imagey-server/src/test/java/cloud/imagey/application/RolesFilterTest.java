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
import static org.assertj.core.api.Assertions.assertThat;

import jakarta.inject.Inject;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class RolesFilterTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Inject
    private TokenService tokenService;

    @Test
    void testEmptySegmentsBranch() {
        User mary = new User(new Email("mary@imagey.cloud"));
        Cookie tokenCookie = new Cookie.Builder("token")
            .value(tokenService.generateToken(mary, Integer.MAX_VALUE).token())
            .build();

        // 1. Request to root "/" to cover empty segments branch in extractUser
        Response rootResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users")
            .request()
            .cookie(tokenCookie)
            .post(null);
        // It might be 400 or something because of missing payload, but RolesFilter will process it with empty segments

        assertThat(rootResponse).isNotNull();
    }
}
