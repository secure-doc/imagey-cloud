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
package cloud.imagey.domain.federation;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.infrastructure.storage.BlobStore;

/**
 * Gives a user of another server a {@link UserId} on this one (ADR 0013 A5): {@code (home domain,
 * address)} maps to a random local id, so that a guest session never carries an id the other server
 * claims. Built like {@link cloud.imagey.domain.user.UserMappingService}: one object per mapping,
 * {@code index/foreign/<hmac>}, the raw id as its content, get-or-create through
 * {@link BlobStore#putIfAbsent}. The pepper is the same {@code user.mapping.secret}.
 */
@ApplicationScoped
public class ForeignUserMappingService {

    private static final String PREFIX = "index/foreign/";

    @Inject
    private BlobStore blobStore;

    @Inject
    @ConfigProperty(name = "user.mapping.secret")
    private String mappingSecret;

    /** The id of {@code address} at {@code domain} (normalized {@code host[:port]}), if it was ever registered. */
    public Optional<UserId> find(String domain, Email address) {
        return blobStore.get(PREFIX + hash(domain, address)).map(stored -> toUserId(stored.content()));
    }

    /** The id of {@code address} at {@code domain}, created on first use. Idempotent, also across instances. */
    public UserId register(String domain, Email address) {
        String key = PREFIX + hash(domain, address);
        UserId candidate = UserId.random();
        if (blobStore.putIfAbsent(key, candidate.id().getBytes(StandardCharsets.UTF_8))) {
            return candidate;
        }
        return blobStore.get(key).map(stored -> toUserId(stored.content())).orElseThrow();
    }

    private static UserId toUserId(byte[] content) {
        return new UserId(new String(content, StandardCharsets.UTF_8));
    }

    // The newline separates domain and address unambiguously: neither can contain one.
    private String hash(String domain, Email address) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(mappingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal((domain + "\n" + address.address()).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Failed to hash foreign user", e);
        }
    }
}
