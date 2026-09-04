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
package cloud.imagey.domain.encryption;

import static java.util.Objects.requireNonNull;

import jakarta.json.bind.annotation.JsonbCreator;
import jakarta.json.bind.annotation.JsonbProperty;
import jakarta.json.bind.annotation.JsonbTypeAdapter;

/**
 * The on-disk form of a wrapped key file (ADR 0009, Option B), replacing the old
 * {@code {issuer, kid, sharedKey}} shape. {@code issuer} and {@code kid} are no longer stored:
 * an offline reader without {@code document.mapping.secret} sees only opaque salted blobs, and the
 * server never needs to <em>recover</em> the endpoints - it recomputes the {@code witness} to test
 * a client-asserted {@code (issuer, kid)}.
 *
 * @param salt      16 random bytes, base64 (standard alphabet)
 * @param witness   {@code base64(HMAC(K_witness, salt || issuer || kid))}, see
 *                  {@code KeyFileCrypto#witness}
 * @param sharedKey the unchanged E2EE-wrapped symmetric key ciphertext
 */
public record StoredKeyFile(
    @JsonbProperty("salt") String salt,
    @JsonbProperty("witness") String witness,
    @JsonbProperty("sharedKey") @JsonbTypeAdapter(EncryptedSymmetricKey.Adapter.class) EncryptedSymmetricKey sharedKey) {

    public StoredKeyFile {
        requireNonNull(salt, "salt");
        requireNonNull(witness, "witness");
        requireNonNull(sharedKey, "sharedKey");
    }

    // JSON-B (Johnzon) cannot build a record whose components are adapter-typed wrappers - the same
    // pattern as EncryptedSharedKey / Message / PrivateKeyMetadata.
    @JsonbCreator
    public StoredKeyFile(
        @JsonbProperty("salt") String salt,
        @JsonbProperty("witness") String witness,
        @JsonbProperty("sharedKey") String sharedKey) {
        this(salt, witness, new EncryptedSymmetricKey(sharedKey));
    }
}
