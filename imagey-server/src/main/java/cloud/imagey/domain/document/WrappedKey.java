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
package cloud.imagey.domain.document;

import static java.util.Objects.requireNonNull;

import cloud.imagey.domain.encryption.EncryptedSymmetricKey;

/**
 * The shrunk {@code GET .../documents/{id}/keys/{kid}} response (ADR 0009, Option B). The client
 * already knows {@code kid} (it sent it) and tracks the owner as {@code DocumentMetadata.owner}, so
 * only the wrapped key ciphertext comes back - {@code issuer} / {@code kid} are no longer disclosed.
 */
public record WrappedKey(EncryptedSymmetricKey sharedKey) {

    public WrappedKey {
        requireNonNull(sharedKey, "sharedKey");
    }
}
