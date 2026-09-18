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
package cloud.imagey.domain.user;

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
import cloud.imagey.infrastructure.storage.BlobStore;

/**
 * Resolves an email address to the {@link UserId} of its account, and mints a new {@code UserId}
 * the first time an address is seen (registration, or an invitation sent to a not-yet-registered
 * address). Each mapping is its own object, keyed {@code index/email-hash/<hmac>} with the raw
 * {@code UserId} string as its entire content - see ADR 0005/0007/0010. ADR 0010 supersedes ADR
 * 0006: the old design kept every mapping in one shared JSON file, guarded by a cross-JVM
 * {@link java.nio.channels.FileLock} plus an atomic rename - neither of which object storage has.
 * One object per mapping instead needs no lock at all, on either backend.
 *
 * <p>The email is stored only as its keyed hash: an attacker who steals the mapping objects cannot
 * recover addresses without the {@code user.mapping.secret} pepper, which is injected at runtime
 * and never stored next to them.
 *
 * <p>{@link #registerUser} is a get-or-create built on {@link BlobStore#putIfAbsent}: whichever
 * caller creates the key first wins, and every other caller - including one racing on a different
 * JVM instance - reads back that winner's id instead of minting its own.
 */
@ApplicationScoped
public class UserMappingService {

    private static final String PREFIX = "index/email-hash/";

    @Inject
    private BlobStore blobStore;

    // No default: deployment fails fast if user.mapping.secret is unset. Losing or changing the
    // pepper makes every existing mapping unrecoverable (ADR 0007), so it must be set explicitly.
    @Inject
    @ConfigProperty(name = "user.mapping.secret")
    private String mappingSecret;

    public Optional<UserId> findUserId(Email email) {
        return blobStore.get(PREFIX + hashEmail(email)).map(stored -> toUserId(stored.content()));
    }

    /**
     * The {@link UserId} for {@code email}, creating and persisting a fresh random one if this is
     * the first time the address is seen. Idempotent: a second call with the same address - from
     * this instance or a concurrent one - returns the id minted by whichever call won the race.
     */
    public UserId registerUser(Email email) {
        String key = PREFIX + hashEmail(email);
        UserId candidate = UserId.random();
        if (blobStore.putIfAbsent(key, candidate.id().getBytes(StandardCharsets.UTF_8))) {
            return candidate;
        }
        // putIfAbsent's contract guarantees the key exists once it reports false, on every
        // BlobStore implementation - so this is always present; see BlobStore#putIfAbsent.
        return blobStore.get(key).map(stored -> toUserId(stored.content())).orElseThrow();
    }

    private static UserId toUserId(byte[] content) {
        return new UserId(new String(content, StandardCharsets.UTF_8));
    }

    private String hashEmail(Email email) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(mappingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(email.address().getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Failed to hash email", e);
        }
    }
}
