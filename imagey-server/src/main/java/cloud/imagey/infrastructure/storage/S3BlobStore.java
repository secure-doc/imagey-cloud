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

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

import cloud.imagey.infrastructure.IoProblemException;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CommonPrefix;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.paginators.ListObjectsV2Iterable;

/**
 * A {@link BlobStore} backed by an S3-compatible object store. Provider-agnostic: everything about
 * which endpoint, region and credentials to use lives in the {@link S3Client} the caller hands in, not
 * here (see {@code BlobStoreProducer}).
 *
 * <p>{@code version} (see {@link StoredObject}) is the object's own S3 ETag, used unmodified as the
 * {@code If-Match}/{@code If-None-Match} precondition value - not the application-level SHA-256 ETag
 * {@code DocumentRepository} computes for its public HTTP contract, which stays backend-independent.
 * This relies on every write here being a single {@code PutObject} call (never multipart), the only
 * case where S3's ETag is guaranteed to be a deterministic, content-derived value.
 *
 * <p>{@link #putIfAbsent} and {@link #putIfVersionMatches} distinguish two different failure shapes a
 * conditional {@code PutObject} can return: {@code 412 Precondition Failed} means the condition
 * definitively does not hold right now (the key exists / the version moved on) - a clean {@code
 * false}. {@code 409 ConditionalRequestConflict} means two conditional writes raced at the same instant
 * and neither side can tell who should have won - not a verdict, so it is retried a bounded number of
 * times rather than being reported as a loss.
 */
public class S3BlobStore implements BlobStore {

    private static final int HTTP_PRECONDITION_FAILED = 412;
    private static final int HTTP_CONFLICT = 409;
    private static final int HTTP_NOT_FOUND = 404;
    private static final int MAX_CONDITIONAL_RETRIES = 5;
    private static final long BASE_BACKOFF_MILLIS = 20;
    private static final long MAX_BACKOFF_MILLIS = 500;

    private final S3Client client;
    private final String bucket;

    public S3BlobStore(S3Client client, String bucket) {
        this.client = client;
        this.bucket = bucket;
    }

    @Override
    public void close() {
        client.close();
    }

    @Override
    public Optional<StoredObject> get(String key) {
        try {
            ResponseBytes<GetObjectResponse> response = client.getObjectAsBytes(
                GetObjectRequest.builder().bucket(bucket).key(key).build());
            return Optional.of(new StoredObject(response.asByteArray(), response.response().eTag()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (S3Exception e) {
            throw new IoProblemException("Could not read " + key, e);
        }
    }

    @Override
    public boolean exists(String key) {
        try {
            client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            if (e.statusCode() == HTTP_NOT_FOUND) {
                return false;
            }
            throw new IoProblemException("Could not check " + key, e);
        }
    }

    @Override
    public boolean putIfAbsent(String key, byte[] content) {
        return conditionalPut(PutObjectRequest.builder().bucket(bucket).key(key).ifNoneMatch("*").build(), content);
    }

    @Override
    public boolean putIfVersionMatches(String key, byte[] content, String expectedVersion) {
        if (!exists(key)) {
            // Observed against MinIO: a conditional PutObject with If-Match against a key that does
            // not exist at all is accepted (the key gets created) rather than rejected with 412, even
            // though If-Match cannot match anything on an absent object. Guard explicitly instead of
            // relying on every S3-compatible backend enforcing this the way RFC 7232 intends - a
            // small window remains if the key is deleted between this check and the write below, but
            // nothing in this application ever deletes a key that {@link #putIfVersionMatches} is
            // called against.
            return false;
        }
        return conditionalPut(
            PutObjectRequest.builder().bucket(bucket).key(key).ifMatch(expectedVersion).build(), content);
    }

    @Override
    public void put(String key, byte[] content) {
        try {
            client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).build(), RequestBody.fromBytes(content));
        } catch (S3Exception e) {
            throw new IoProblemException("Could not write " + key, e);
        }
    }

    @Override
    public ListResult list(String prefix, String delimiter) {
        ListObjectsV2Request request = ListObjectsV2Request.builder()
            .bucket(bucket).prefix(prefix).delimiter(delimiter).build();
        List<String> keys = new ArrayList<>();
        List<String> commonPrefixes = new ArrayList<>();
        try {
            ListObjectsV2Iterable pages = client.listObjectsV2Paginator(request);
            for (var page : pages) {
                for (S3Object object : page.contents()) {
                    // A zero-byte "directory marker" object (some S3 clients/consoles create one on
                    // "New Folder") would have a key exactly equal to the prefix being listed - a
                    // real directory can never list itself as its own child, so filter it out for
                    // parity with FilesystemBlobStore.
                    if (!object.key().equals(prefix)) {
                        keys.add(object.key());
                    }
                }
                for (CommonPrefix commonPrefix : page.commonPrefixes()) {
                    commonPrefixes.add(commonPrefix.prefix());
                }
            }
        } catch (S3Exception e) {
            throw new IoProblemException("Could not list " + prefix, e);
        }
        return new ListResult(keys, commonPrefixes);
    }

    @Override
    public void delete(String key) {
        try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (S3Exception e) {
            throw new IoProblemException("Could not delete " + key, e);
        }
    }

    private boolean conditionalPut(PutObjectRequest request, byte[] content) {
        RequestBody body = RequestBody.fromBytes(content);
        for (int attempt = 0; attempt < MAX_CONDITIONAL_RETRIES; attempt++) {
            try {
                client.putObject(request, body);
                return true;
            } catch (S3Exception e) {
                if (e.statusCode() == HTTP_PRECONDITION_FAILED) {
                    return false;
                }
                if (e.statusCode() != HTTP_CONFLICT) {
                    throw new IoProblemException("Could not write " + request.key(), e);
                }
                // 409: two conditional writes raced at the same instant - retry, see class Javadoc.
                // Full-jitter backoff (doubling per attempt, capped) spreads repeatedly colliding
                // writers apart instead of letting them re-race in lockstep on every attempt.
                backoff(attempt);
            }
        }
        throw new IoProblemException("Exhausted retries on a conditional write for " + request.key());
    }

    private static void backoff(int attempt) {
        long cap = Math.min(MAX_BACKOFF_MILLIS, BASE_BACKOFF_MILLIS * (1L << attempt));
        try {
            Thread.sleep(ThreadLocalRandom.current().nextLong(cap + 1));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IoProblemException("Interrupted while backing off a conditional write retry", e);
        }
    }
}
