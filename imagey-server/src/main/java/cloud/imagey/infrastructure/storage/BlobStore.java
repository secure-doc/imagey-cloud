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

import java.util.Optional;

/**
 * A key/value blob store, abstracting over the concrete storage backend (local filesystem, S3-compatible
 * object storage, ...) that the repositories in {@code cloud.imagey.domain} are ultimately persisted on.
 * A {@code key} is an opaque, {@code /}-separated logical path (e.g. {@code "userId/documents/docId/metadata.enc"})
 * - implementations are free to map it onto a real filesystem path or an object key however suits the backend.
 *
 * <p>Two writes carry their own concurrency contract, because the two backends this store is built for
 * (a local filesystem and an S3-compatible object store) disagree on what "atomic" even means:
 * <ul>
 *   <li>{@link #putIfAbsent} is a create-only write: it either creates the key, or - if the key already
 *       exists - changes nothing and reports that back. This is what a write-once key file (a shared-key
 *       slot, a fresh account marker) needs, and what {@code UserMappingService}'s get-or-create relies on.</li>
 *   <li>{@link #putIfVersionMatches} is a compare-and-swap write: it only writes if the key's current
 *       {@link StoredObject#version} still matches the version the caller last read. This is what optimistic
 *       locking on a mutable key (a folder's content) needs once more than one JVM instance can write it.</li>
 * </ul>
 * Both are meant to be safe under concurrent callers, including - for a backend that supports it - callers
 * running in different JVM instances with no shared local state.
 */
public interface BlobStore extends AutoCloseable {

    /** The current content and backend-native {@link StoredObject#version} of {@code key}, if it exists. */
    Optional<StoredObject> get(String key);

    /** Whether {@code key} currently exists, without fetching its content. */
    boolean exists(String key);

    /**
     * Creates {@code key} with {@code content} if it does not exist yet.
     *
     * @return {@code true} if this call created the key, {@code false} if it already existed (in which
     *         case nothing was written - the caller decides whether that is a conflict or a no-op, e.g.
     *         by comparing the existing content)
     */
    boolean putIfAbsent(String key, byte[] content);

    /**
     * Overwrites {@code key} with {@code content}, but only if its current {@link StoredObject#version}
     * still equals {@code expectedVersion}.
     *
     * @return {@code true} if the write happened, {@code false} on a version mismatch (nothing was written)
     */
    boolean putIfVersionMatches(String key, byte[] content, String expectedVersion);

    /** Writes {@code key}, overwriting any existing content unconditionally. */
    void put(String key, byte[] content);

    /**
     * Lists the keys directly under {@code prefix}, the way a single directory listing would.
     *
     * @param prefix    the prefix to list under; either empty or ending in {@code delimiter}
     * @param delimiter groups everything past the first occurrence after {@code prefix} into a
     *                  {@link ListResult#commonPrefixes()} entry instead of a {@link ListResult#keys()} entry -
     *                  mirrors the S3 {@code ListObjectsV2} prefix/delimiter contract
     */
    ListResult list(String prefix, String delimiter);

    /** Removes {@code key}, if it exists. A no-op if it does not. */
    void delete(String key);

    /** Releases any resources this store holds (a network client's connection pool, ...). A no-op unless overridden. */
    @Override
    default void close() {
    }
}
