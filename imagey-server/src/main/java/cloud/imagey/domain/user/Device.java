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

import cloud.imagey.domain.encryption.PublicKey;

// A device as listed to its owner: activated once another device stored the private main key
// for it, info is null for devices registered before devices described themselves (ADR 0017).
// The public key comes along because the client needs it to decrypt the info - one request for
// the whole list instead of one more per device.
public record Device(DeviceId deviceId, boolean activated, PublicKey publicKey, EncryptedDeviceInfo info) {

}
