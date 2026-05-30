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

import java.security.Principal;
import java.util.function.Function;

import jakarta.ws.rs.core.SecurityContext;

public interface DefaultSecurityContext extends SecurityContext {

    static SecurityContext forPrincipal(String name, Function<String, Boolean> isUserInRole) {
        return new DefaultSecurityContext() {
            public String getUserPrincipalName() {
                return name;
            }

            public boolean isUserInRole(String role) {
                return isUserInRole.apply(role);
            }
        };
    }

    String getUserPrincipalName();

    @Override
    default Principal getUserPrincipal() {
        return () -> getUserPrincipalName();
    }

    @Override
    default boolean isUserInRole(String role) {
        return false;
    }

    @Override
    default boolean isSecure() {
        return true;
    }

    @Override
    default String getAuthenticationScheme() {
        return DIGEST_AUTH;
    }

}
