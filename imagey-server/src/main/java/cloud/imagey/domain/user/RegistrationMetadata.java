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

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.encryption.EncryptedPrivateKey;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.PublicKey;

// The scalar half of a registration request (see UserResource#registerUser): everything the client
// sends as the single JSON "metadata" multipart part, as opposed to the four opaque encrypted
// document blobs that stay their own binary parts. Deserialized straight from that JSON object by
// RecordMessageBodyReader / AbstractRecordConverter - the JSON keys must match these component
// names exactly. UserResource#toRegistration folds this plus the four blobs into UserRegistration.
//
// The userId is the one the server minted in RegistrationFilter / InvitationFilter and handed back
// on the redirect (?userId=); registerUser only accepts it if it matches the authenticated
// principal. settingsKey has no matching id here because the settings document's id is always the
// user's own userId (see UserService.register), so only documentList/chatList/profile carry an
// explicit client-generated id alongside their self-key.
public record RegistrationMetadata(
    UserId userId,
    DeviceId deviceId,
    PublicKey devicePublicKey,
    PublicKey mainPublicKey,
    EncryptedPrivateKey encryptedPrivateKey,
    EncryptedSharedKey settingsKey,
    RegisteredDocument documentList,
    RegisteredDocument chatList,
    RegisteredDocument profile) {

    public record RegisteredDocument(DocumentId id, EncryptedSharedKey key) {
    }
}
