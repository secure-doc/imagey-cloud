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

import java.util.Map;

import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.user.User;

/**
 * A single "add this document to this folder" request (see {@link DocumentService#uploadDocument}).
 * The new document lands in the caller's tree; the folder's updated content lands in
 * {@code folderOwner}'s tree (the two are the same account for one's own folders).
 *
 * @param folderOwner     the account whose tree the folder lives in
 * @param folderId        the id of the (existing) folder document the new document is added to
 * @param folderContent   the folder document's new encrypted content, now referencing the new document
 * @param folderETag      the ETag the client last saw for the folder ({@code DocumentRepository#getETag});
 *                        a stale value is rejected with 412. {@code null} skips the check.
 * @param documentId      the id of the new document
 * @param documentContent the new document's encrypted metadata
 * @param sharedKey       the new document's shared key, filed under {@code folderId}, issued by {@code folderOwner}
 * @param files           the new document's encrypted content streams, keyed by file name (may be empty)
 */
public record DocumentUpload(
    User folderOwner,
    DocumentId folderId,
    EncryptedContent folderContent,
    String folderETag,
    DocumentId documentId,
    EncryptedContent documentContent,
    EncryptedSharedKey sharedKey,
    Map<FileName, EncryptedContent> files) {
}
