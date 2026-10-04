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

import java.util.Base64;

/**
 * Unpadded base64url (RFC 4648 §5) codec - the wire form Web Push keys, VAPID keys and JWT segments
 * all use (RFC 8291/8292). {@link Base64.Decoder} needs padding restored before it will accept a
 * string that omits it.
 */
public final class Base64Url {

    private static final int GROUP_SIZE = 4;

    private Base64Url() {
    }

    /** @throws IllegalArgumentException if {@code value} is not valid base64url */
    public static byte[] decode(String value) {
        return Base64.getUrlDecoder().decode(pad(value));
    }

    public static String encode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String pad(String value) {
        int remainder = value.length() % GROUP_SIZE;
        return remainder == 0 ? value : value + "=".repeat(GROUP_SIZE - remainder);
    }
}
