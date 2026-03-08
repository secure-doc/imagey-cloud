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
package cloud.imagey.application.authentication;

import static javax.ws.rs.core.SecurityContext.DIGEST_AUTH;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

public class SecurityContextTest {

    private DefaultSecurityContext context = new DefaultSecurityContext() {

        @Override
        public String getUserPrincipalName() {
            return null;
        }
    };

    @Test
    void defaultMethods() {
        assertThat(context.isUserInRole("owner")).isEqualTo(false);
        assertThat(context.isSecure()).isEqualTo(true);
        assertThat(context.getAuthenticationScheme()).isEqualTo(DIGEST_AUTH);
    }
}
