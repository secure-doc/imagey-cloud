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

import java.net.URI;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Disposes;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;

/**
 * Selects the {@link BlobStore} implementation the rest of the application injects, based on {@code
 * storage.type} ({@code filesystem}, the default, or {@code s3}). This is the only place that knows both
 * backends exist, and the only place that knows how to build an {@link S3Client} - deliberately
 * provider-agnostic: {@code storage.s3.endpoint} is optional and unset by default, so this targets the
 * SDK's normal AWS endpoint resolution unless pointed at a specific S3-compatible endpoint (MinIO, or
 * any other provider). Credentials are never read from config - the SDK's default credential chain
 * (environment, {@code ~/.aws}, instance profile, ...) applies, matching how every other secret in this
 * application is supplied via the deployment environment rather than a checked-in default.
 */
@ApplicationScoped
public class BlobStoreProducer {

    @Inject
    @ConfigProperty(name = "storage.type", defaultValue = "filesystem")
    private String storageType;

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    @ConfigProperty(name = "storage.s3.bucket", defaultValue = "")
    private String s3Bucket;

    @Inject
    @ConfigProperty(name = "storage.s3.region", defaultValue = "")
    private String s3Region;

    @Inject
    @ConfigProperty(name = "storage.s3.endpoint", defaultValue = "")
    private String s3Endpoint;

    @Inject
    @ConfigProperty(name = "storage.s3.path-style-access", defaultValue = "false")
    private boolean s3PathStyleAccess;

    @Produces
    @ApplicationScoped
    public BlobStore blobStore() {
        return switch (storageType) {
            case "filesystem" -> new FilesystemBlobStore(rootPath);
            case "s3" -> new S3BlobStore(s3Client(), require(s3Bucket, "storage.s3.bucket"));
            default -> throw new IllegalStateException("Unsupported storage.type: " + storageType);
        };
    }

    public void disposeBlobStore(@Disposes BlobStore blobStore) {
        blobStore.close();
    }

    private S3Client s3Client() {
        S3ClientBuilder builder = S3Client.builder()
            .region(Region.of(require(s3Region, "storage.s3.region")))
            .forcePathStyle(s3PathStyleAccess);
        if (!s3Endpoint.isBlank()) {
            builder.endpointOverride(URI.create(s3Endpoint));
        }
        return builder.build();
    }

    private static String require(String value, String property) {
        if (value.isBlank()) {
            throw new IllegalStateException(property + " is required when storage.type=s3");
        }
        return value;
    }
}
