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
package cloud.imagey.infrastructure.push;

/**
 * Sends one already-serialized push payload to one subscription's push service. Lives in
 * {@code infrastructure} (like {@code cloud.imagey.infrastructure.storage.BlobStore}) rather than as a
 * domain-owned port: the infrastructure layer must not depend on domain types (see {@code
 * ArchitectureTest#noCycles}), so every parameter here is a primitive/string, never a domain record -
 * {@code cloud.imagey.domain.push.PushNotificationService} is the only caller and does that translation.
 */
public interface PushGateway {

    enum Result {
        /** Accepted by the push service. */
        SENT,
        /** The push service reports the subscription no longer exists (HTTP 404/410) - delete it. */
        GONE,
        /** Sending failed for any other reason; logged, nothing to act on beyond a retry on the next event. */
        ERROR
    }

    /**
     * @param endpoint     the subscription's push service URL
     * @param p256dh       the subscriber's public key, base64url, 65 bytes decoded
     * @param auth         the subscriber's authentication secret, base64url, 16 bytes decoded
     * @param payload      the plaintext payload (already-serialized JSON) to encrypt and send
     * @param highUrgency  {@code true} for a new-message push, {@code false} for a lower-priority one
     */
    Result send(String endpoint, String p256dh, String auth, String payload, boolean highUrgency);
}
