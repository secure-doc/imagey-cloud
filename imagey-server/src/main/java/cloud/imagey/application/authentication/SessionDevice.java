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

import cloud.imagey.domain.user.DeviceId;

/**
 * The device the current session is bound to (ADR 0018). {@link RolesFilter} decodes the session
 * cookie once and publishes the device claim as a request attribute; resources read it here.
 */
public final class SessionDevice {

    private static final String ATTRIBUTE = SessionDevice.class.getName();

    private SessionDevice() {
    }

    static void set(HttpServletRequest request, Optional<DeviceId> device) {
        request.setAttribute(ATTRIBUTE, device);
    }

    @SuppressWarnings("unchecked")
    public static Optional<DeviceId> of(HttpServletRequest request) {
        Object device = request.getAttribute(ATTRIBUTE);
        return device instanceof Optional<?> optional ? (Optional<DeviceId>) optional : Optional.empty();
    }
}
