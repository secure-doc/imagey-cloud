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

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.user.User;

/**
 * The scalar half of a document upload (see {@code DocumentResource#uploadDocument}): everything the
 * client sends as the single JSON {@code metadata} multipart part, as opposed to the opaque
 * encrypted {@code folder} / {@code document} / {@code files} blobs that stay their own binary
 * parts. Deserialized straight from that JSON object by RecordMessageBodyReader /
 * AbstractRecordConverter - the JSON keys must match these component names exactly. Mirrors
 * {@code cloud.imagey.domain.user.RegistrationMetadata}.
 *
 * @param folderOwner the account whose tree the folder lives in - the caller when adding to one of
 *                    their own folders, someone else when contributing to a folder shared with them
 * @param folderId    the id of the (existing) folder document the new document is added to
 * @param folderETag  the ETag the client last saw for the folder document (see
 *                    {@code DocumentRepository#getETag}); the upload is rejected with 412 if the
 *                    folder has changed since. May be {@code null} - the check is then skipped.
 * @param documentId  the id of the new document (stored in the caller's tree)
 * @param key         the new document's shared key, wrapping the document key under the folder key
 *                    ({@code kid} = {@code folderId}, {@code issuer} = {@code folderOwner})
 */
public record UploadMetadata(
    User folderOwner, DocumentId folderId, String folderETag, DocumentId documentId, EncryptedSharedKey key) {
}
