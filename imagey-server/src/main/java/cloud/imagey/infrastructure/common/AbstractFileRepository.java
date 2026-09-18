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
package cloud.imagey.infrastructure.common;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import jakarta.inject.Inject;

import cloud.imagey.infrastructure.IoProblemException;
import cloud.imagey.infrastructure.ResourceConflictException;
import cloud.imagey.infrastructure.storage.BlobStore;
import cloud.imagey.infrastructure.storage.ListResult;
import cloud.imagey.infrastructure.storage.StoredObject;

/**
 * Base for the repositories in {@code cloud.imagey.domain} that persist through a {@link BlobStore}:
 * turns byte-level store operations into the string/key-composition helpers those repositories use.
 * A "folder" in the sense the domain code speaks of it (e.g. {@code documents/<id>/files/}) is just a
 * key prefix here - the store creates any parent keys it needs on its own, there is nothing to create
 * up front the way {@code java.io.File} used to require.
 */
public class AbstractFileRepository {

    protected static final Charset UTF_8 = StandardCharsets.UTF_8;

    private static final String DELIMITER = "/";

    @Inject
    private BlobStore blobStore;

    /** Joins path segments into a single {@code /}-separated key. */
    protected static String join(String... segments) {
        return String.join(DELIMITER, segments);
    }

    /**
     * The storage prefix of a single account, {@code <userId>}. Takes the raw id string rather than
     * a {@code cloud.imagey.domain.user.User} on purpose: the infrastructure layer must not depend
     * on domain types (see {@code ArchitectureTest#noCycles}).
     */
    protected String getUserPrefix(String userId) {
        return userId;
    }

    protected boolean exists(String key) {
        return blobStore.exists(key);
    }

    protected Optional<byte[]> find(String key) {
        return blobStore.get(key).map(StoredObject::content);
    }

    /** The content together with its backend-native version, for a caller that needs both from one read. */
    protected Optional<StoredObject> get(String key) {
        return blobStore.get(key);
    }

    protected Optional<String> findString(String key) {
        return find(key).map(bytes -> new String(bytes, UTF_8));
    }

    protected String readString(String key) {
        return findString(key).orElseThrow(() -> new IoProblemException("Missing key: " + key));
    }

    protected void put(String key, byte[] content) {
        blobStore.put(key, content);
    }

    protected void put(String key, String content) {
        put(key, content.getBytes(UTF_8));
    }

    /** Raw create-only write; the caller decides how to react to {@code false} (the key already existed). */
    protected boolean putIfAbsent(String key, byte[] content) {
        return blobStore.putIfAbsent(key, content);
    }

    /**
     * Creates {@code key} with {@code content} if it does not exist yet. A repeat call with the same
     * content is a no-op; a repeat call with different content is a 409 - write-once with idempotent
     * retries.
     */
    protected void createIfAbsent(String key, String content) {
        if (!putIfAbsent(key, content.getBytes(UTF_8)) && !readString(key).equals(content)) {
            throw new ResourceConflictException(key + " already exists");
        }
    }

    /**
     * Overwrites {@code key} with {@code content}, but only if it is still at {@code expectedVersion}
     * (from a prior {@link #get}) - optimistic locking on a mutable key, safe across JVM instances.
     *
     * @return {@code true} if the write happened, {@code false} on a version mismatch (nothing written)
     */
    protected boolean putIfVersionMatches(String key, byte[] content, String expectedVersion) {
        return blobStore.putIfVersionMatches(key, content, expectedVersion);
    }

    /** Lists the keys and one-level-deeper prefixes directly under {@code prefix}. */
    protected ListResult list(String prefix) {
        return blobStore.list(prefix.isEmpty() ? "" : prefix + DELIMITER, DELIMITER);
    }
}
