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

import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;

/**
 * The wire / in-memory shape of a shared key: the request body of {@code POST .../keys} and the
 * multipart {@code key} part of a document upload, (de)serialized reflectively by
 * {@code RecordMessageBodyReader}/{@code AbstractRecordMessageBodyWriter} - not JSON-B, so no
 * {@code @JsonbCreator}/{@code @JsonbTypeAdapter} annotations are needed here. Since ADR 0009 this
 * is no longer the on-disk format either (see {@link StoredKeyFile}):
 * {@link cloud.imagey.domain.document.DocumentRepository} derives a {@code StoredKeyFile} from one
 * of these on write, and never serializes this type directly.
 */
public record EncryptedSharedKey(User issuer, Kid kid, EncryptedSymmetricKey sharedKey) {

    public EncryptedSharedKey {
        requireNonNull(issuer, "issuer");
        requireNonNull(kid, "kid");
        requireNonNull(sharedKey, "sharedKey");
    }
}
