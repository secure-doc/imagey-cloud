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
package cloud.imagey.domain.contact;

import jakarta.json.bind.annotation.JsonbTypeAdapter;
import jakarta.json.bind.annotation.JsonbTypeDeserializer;
import jakarta.json.bind.annotation.JsonbTypeSerializer;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.encryption.PublicKey.Deserializer;
import cloud.imagey.domain.encryption.PublicKey.Serializer;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

public record ContactExchange(
    @JsonbTypeAdapter(User.Adapter.class) User inviter,
    @JsonbTypeAdapter(Email.Adapter.class) Email invitee,
    ContactStatus status,
    @JsonbTypeSerializer(Serializer.class)
    @JsonbTypeDeserializer(Deserializer.class)
    PublicKey publicKey,
    @JsonbTypeAdapter(DocumentId.Adapter.class) DocumentId chatId,
    @JsonbTypeAdapter(EncryptedSymmetricKey.Adapter.class) EncryptedSymmetricKey sharedKey) {
}
