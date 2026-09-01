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

import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

public record EncryptedSharedKey(
    @JsonbProperty("issuer") @JsonbTypeAdapter(User.Adapter.class) User issuer,
    @JsonbProperty("kid") Kid kid,
    @JsonbProperty("sharedKey") @JsonbTypeAdapter(EncryptedSymmetricKey.Adapter.class) EncryptedSymmetricKey sharedKey) {

    public EncryptedSharedKey {
        requireNonNull(issuer, "issuer");
        requireNonNull(kid, "kid");
        requireNonNull(sharedKey, "sharedKey");
    }

    // JSON-B (Johnzon) cannot build a record whose components are adapter-typed wrappers - see the
    // same pattern on Message / PrivateKeyMetadata. DocumentRepository stores shared keys as JSON.
    @JsonbCreator
    public EncryptedSharedKey(
        @JsonbProperty("issuer") String issuer,
        @JsonbProperty("kid") String kid,
        @JsonbProperty("sharedKey") String sharedKey) {
        this(new User(new UserId(issuer)), new Kid(kid), new EncryptedSymmetricKey(sharedKey));
    }
}
