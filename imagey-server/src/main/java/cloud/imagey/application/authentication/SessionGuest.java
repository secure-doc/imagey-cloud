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

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The home domain of the current guest session (ADR 0013 A4), empty for a local session.
 * {@link RolesFilter} publishes it as a request attribute, like {@link SessionDevice}.
 */
public final class SessionGuest {

    private static final String ATTRIBUTE = SessionGuest.class.getName();

    private SessionGuest() {
    }

    static void set(HttpServletRequest request, Optional<String> guestDomain) {
        request.setAttribute(ATTRIBUTE, guestDomain);
    }

    @SuppressWarnings("unchecked")
    public static Optional<String> of(HttpServletRequest request) {
        Object guest = request.getAttribute(ATTRIBUTE);
        return guest instanceof Optional<?> optional ? (Optional<String>) optional : Optional.empty();
    }
}
