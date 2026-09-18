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
package cloud.imagey.infrastructure.storage;

/**
 * A blob's content together with its backend-native {@code version}: an opaque token (a content hash for
 * {@code FilesystemBlobStore}, the real object ETag for {@code S3BlobStore}) that changes exactly when the
 * content does. Used only for {@link BlobStore#putIfVersionMatches} - it is deliberately not the same value
 * as the application-level SHA-256 ETag repositories expose over HTTP, which stays backend-independent.
 */
public record StoredObject(byte[] content, String version) {
}
