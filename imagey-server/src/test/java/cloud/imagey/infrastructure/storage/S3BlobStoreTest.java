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

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.apache5.Apache5HttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.api.BackoffStrategy;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * Runs {@link BlobStoreContractTest} against a real MinIO instance - the two riskiest primitives
 * ({@code putIfAbsent}, {@code putIfVersionMatches}) are exactly where a mocked {@code S3Client} would
 * give false confidence.
 *
 * <p>The image is {@code pgsty/minio}, a community build of the unmodified MinIO server: MinIO
 * stopped publishing free images, and both {@code minio/minio} (Docker Hub) and
 * {@code quay.io/minio/minio} no longer allow anonymous pulls. The tag must stay pinned to a release
 * on/after {@code RELEASE.2024-09-13T20-26-02Z}: MinIO's {@code If-None-Match: *} support (what
 * {@link S3BlobStore#putIfAbsent} relies on) was broken before that release
 * (github.com/minio/minio/issues/20346) - do not relax this to {@code latest}.
 *
 * <p>One container is shared across the whole class for speed; each test gets its own freshly created
 * bucket (named after the running test) for isolation, mirroring what {@code @TempDir} gives
 * {@link FilesystemBlobStoreTest} per test.
 */
@Testcontainers
class S3BlobStoreTest extends BlobStoreContractTest {

    // The official MinIO images (Docker Hub and Quay) are no longer pullable anonymously.
    private static final DockerImageName MINIO_IMAGE =
        DockerImageName.parse("pgsty/minio:RELEASE.2026-08-04T00-00-00Z");
    private static final int MINIO_PORT = 9000;
    private static final String ACCESS_KEY = "minioadmin";
    private static final String SECRET_KEY = "minioadmin";
    // The contract test races many threads against one client (see #racers()); on a real S3-compatible
    // server (unlike the in-process filesystem backend) that means a genuine burst of simultaneous new
    // connections. Observed in CI: MinIO rejects some of that burst outright (SdkClientException,
    // failing in well under a second - a fast connection-level failure, not a slow timeout) on a
    // resource-constrained runner, even though the exact same test is solid locally. Two independent
    // mitigations, since either alone was not enough: fewer simultaneous racers (below), and real
    // backoff between SDK-internal retries instead of the near-immediate default (retryStrategy below)
    // so a transient rejection gets a real chance to clear before the next attempt.
    private static final int RACERS = 10;
    private static final int MAX_CONNECTIONS = 64;
    private static final Duration CONNECTION_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration SOCKET_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration API_CALL_ATTEMPT_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration API_CALL_TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_RETRY_ATTEMPTS = 10;
    private static final Duration RETRY_BASE_DELAY = Duration.ofMillis(200);
    private static final Duration RETRY_MAX_DELAY = Duration.ofSeconds(5);

    @Container
    private static final GenericContainer<?> MINIO = new GenericContainer<>(MINIO_IMAGE)
        .withEnv("MINIO_ROOT_USER", ACCESS_KEY)
        .withEnv("MINIO_ROOT_PASSWORD", SECRET_KEY)
        .withCommand("server", "/data")
        .withExposedPorts(MINIO_PORT)
        .waitingFor(Wait.forHttp("/minio/health/live"));

    private S3Client client;
    private String bucket;
    private BlobStore store;

    @Override
    protected int racers() {
        return RACERS;
    }

    @AfterEach
    void closeClient() {
        client.close();
    }

    // Builds the client here rather than in a separate @BeforeEach: JUnit5 runs a superclass's
    // @BeforeEach (BlobStoreContractTest#createStoreForTest, which calls this method) before a
    // subclass's own @BeforeEach methods, so a sibling @BeforeEach here would still see a null client.
    @Override
    protected BlobStore createStore() {
        client = S3Client.builder()
            .endpointOverride(URI.create("http://" + MINIO.getHost() + ":" + MINIO.getMappedPort(MINIO_PORT)))
            .region(Region.US_EAST_1)
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY)))
            .forcePathStyle(true)
            .httpClientBuilder(Apache5HttpClient.builder()
                .maxConnections(MAX_CONNECTIONS)
                .connectionTimeout(CONNECTION_TIMEOUT)
                .socketTimeout(SOCKET_TIMEOUT))
            .overrideConfiguration(ClientOverrideConfiguration.builder()
                .apiCallAttemptTimeout(API_CALL_ATTEMPT_TIMEOUT)
                .apiCallTimeout(API_CALL_TIMEOUT)
                .retryStrategy(b -> b
                    .maxAttempts(MAX_RETRY_ATTEMPTS)
                    .backoffStrategy(BackoffStrategy.exponentialDelayHalfJitter(RETRY_BASE_DELAY, RETRY_MAX_DELAY)))
                .build())
            .build();
        bucket = "test-" + UUID.randomUUID();
        client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
        store = new S3BlobStore(client, bucket);
        return store;
    }

    @Test
    @DisplayName("list filters out a zero-byte directory-marker object whose key equals the listed prefix")
    void listFiltersDirectoryMarkerObject() {
        // Simulates what an external tool (the MinIO/S3 console's "create folder", a bucket migrated
        // from another S3 client) can leave behind - not something S3BlobStore itself ever writes.
        client.putObject(
            PutObjectRequest.builder().bucket(bucket).key("folder/").build(), RequestBody.fromBytes(new byte[0]));
        store.put("folder/file.json", "content".getBytes(StandardCharsets.UTF_8));

        ListResult result = store.list("folder/", "/");

        assertThat(result.keys()).containsExactly("folder/file.json");
    }
}
