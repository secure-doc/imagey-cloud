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
package cloud.imagey.domain.user;

import static java.util.Objects.requireNonNull;

import java.util.regex.Pattern;

// A device's name, platform and registration date, encrypted by the client under a key the
// server cannot derive (ECDH of the user's main key pair and the device's key pair, see
// docs/adr/0017-encrypted-device-info.md). Opaque base64 to the server.
public record EncryptedDeviceInfo(String info) {

    // The client pads the info to 256 byte blocks; a few blocks are plenty for a name.
    private static final int MAX_LENGTH = 4096;
    private static final Pattern BASE64 = Pattern.compile("[A-Za-z0-9+/]+={0,2}");

    public EncryptedDeviceInfo {
        requireNonNull(info, "info");
        if (info.length() > MAX_LENGTH || !BASE64.matcher(info).matches()) {
            throw new IllegalArgumentException("Device info must be base64 of at most " + MAX_LENGTH + " characters");
        }
    }
}
