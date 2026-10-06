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

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

public class SessionGuestTest {

    private final Map<String, Object> attributes = new HashMap<>();
    private final HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(
        getClass().getClassLoader(),
        new Class<?>[] {HttpServletRequest.class},
        (proxy, method, args) -> {
            if ("setAttribute".equals(method.getName())) {
                attributes.put((String) args[0], args[1]);
                return null;
            }
            return attributes.get((String) args[0]);
        });

    @Test
    @DisplayName("The home domain of a guest session is published as a request attribute")
    void guestDomain() {
        SessionGuest.set(request, Optional.of("secure-doc.store"));

        assertThat(SessionGuest.of(request)).contains("secure-doc.store");
    }

    @Test
    @DisplayName("Without a guest session there is no guest domain")
    void noGuest() {
        assertThat(SessionGuest.of(request)).isEmpty();

        SessionGuest.set(request, Optional.empty());

        assertThat(SessionGuest.of(request)).isEmpty();
    }
}
