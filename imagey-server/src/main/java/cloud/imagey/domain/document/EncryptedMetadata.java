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

import cloud.imagey.domain.encryption.EncryptedContent;

/**
 * A document's encrypted {@code metadata.enc} together with its ETag (hex SHA-256 of the same
 * bytes), so a caller that needs both reads and hashes the file only once. See
 * {@link DocumentRepository#loadEncryptedMetadataWithETag}.
 */
public record EncryptedMetadata(EncryptedContent content, String etag) {
}
