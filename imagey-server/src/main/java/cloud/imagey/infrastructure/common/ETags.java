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
package cloud.imagey.infrastructure.common;

import java.util.Objects;

/**
 * Shared HTTP ETag helpers for the precondition paths that cannot go through
 * {@code jakarta.ws.rs.core.Request#evaluatePreconditions} (the folder-upload check runs in the
 * service layer, under a lock, with no {@code Request} in scope). The framework PUT path keeps
 * using {@code Request}; this only exists so the two share the same normalise/compare rules.
 */
public final class ETags {

    private ETags() {
    }

    /** Strips an optional weak prefix ({@code W/}) and one pair of surrounding double quotes. */
    public static String normalize(String etag) {
        if (etag == null) {
            return null;
        }
        String value = etag.startsWith("W/") ? etag.substring(2) : etag;
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    /** Whether the client-supplied {@code provided} tag, once normalised, equals {@code current}. */
    public static boolean matches(String provided, String current) {
        return Objects.equals(normalize(provided), current);
    }
}
