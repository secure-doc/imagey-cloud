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

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Derives the at-rest representation of a wrapped-key file (ADR 0009, Option B). Replaces the old
 * {@code documents/{docId}/keys/{kid}.json} layout - where {@code issuer} and {@code kid} were
 * plaintext and {@code kid} was also the file name - with:
 *
 * <ul>
 *   <li>an <em>edge-unique</em> file name {@code base64url(HMAC(K_name, docId || 0x00 || kid))} that
 *       is a function of <em>both</em> endpoints, so it neither collides with {@code documents/{kid}/}
 *       nor repeats across two siblings of one folder;</li>
 *   <li>a per-file random {@code salt} plus a one-way {@code witness =
 *       base64(HMAC(K_witness, salt || 0x00 || issuerId || 0x00 || kidId))}, so the same
 *       {@code (issuer, kid)} referenced from 50 documents produces 50 uncorrelated witnesses and the
 *       server never needs to <em>recover</em> {@code issuer} / {@code kid} (the client always has
 *       them).</li>
 * </ul>
 *
 * <p>An attacker with the data volume but not the secret sees only {@code {salt, <blob>, <blob>}};
 * an attacker who also holds the secret can only guess-test 122-bit UUIDs.
 *
 * <p>Raw {@code String} ids only, no domain types: the infrastructure layer must not depend on
 * domain classes (see {@code ArchitectureTest#noCycles}). Mirrors {@code UserMappingService}'s
 * {@link Mac} / {@link SecretKeySpec} / URL-safe-no-pad {@link Base64} usage.
 */
@ApplicationScoped
public class KeyFileCrypto {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final byte SEP = 0x00;
    private static final int SALT_LENGTH = 16;
    private static final byte[] SALT_LABEL = "salt".getBytes(StandardCharsets.UTF_8);

    // HKDF-Expand, single block: the configured secret is required to be >= 256 bits of entropy, so
    // it is used directly as the PRK. The trailing 0x01 is the HKDF block counter.
    private static final byte[] NAME_INFO = infoBlock("imagey/keyfile-name/v1");
    private static final byte[] WITNESS_INFO = infoBlock("imagey/keyfile-witness/v1");

    private final SecureRandom random = new SecureRandom();

    // No default: deployment fails fast if document.mapping.secret is unset. Losing or changing it
    // makes every existing key file unresolvable (ADR 0009), so it must be set explicitly - same
    // policy as user.mapping.secret (ADR 0007).
    @Inject
    @ConfigProperty(name = "document.mapping.secret")
    private String secret;

    private SecretKeySpec nameKey;
    private SecretKeySpec witnessKey;

    @PostConstruct
    void init() {
        byte[] secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        nameKey = new SecretKeySpec(hmac(secretBytes, NAME_INFO), HMAC_SHA256);
        witnessKey = new SecretKeySpec(hmac(secretBytes, WITNESS_INFO), HMAC_SHA256);
    }

    /** {@code base64url(HMAC(K_name, docId || 0x00 || kid)) + ".json"} - the on-disk key-file name. */
    public String fileName(String documentId, String kid) {
        return base64Url(mac(nameKey, concat(bytes(documentId), SEP, bytes(kid)))) + ".json";
    }

    /**
     * {@code HMAC(K_name, "salt" || 0x00 || docId || 0x00 || kid)}, first 16 bytes. Used only by the
     * one-off fixture migration so its output is reproducible; production writes use
     * {@link #randomSalt()}.
     */
    public byte[] deterministicSalt(String documentId, String kid) {
        byte[] full = mac(nameKey, concat(SALT_LABEL, SEP, bytes(documentId), SEP, bytes(kid)));
        byte[] salt = new byte[SALT_LENGTH];
        System.arraycopy(full, 0, salt, 0, SALT_LENGTH);
        return salt;
    }

    /** 16 fresh random bytes. */
    public byte[] randomSalt() {
        byte[] salt = new byte[SALT_LENGTH];
        random.nextBytes(salt);
        return salt;
    }

    /** {@code base64(HMAC(K_witness, salt || 0x00 || issuerId || 0x00 || kidId))}. */
    public String witness(byte[] salt, String issuerId, String kidId) {
        return Base64.getEncoder().encodeToString(
            mac(witnessKey, concat(salt, SEP, bytes(issuerId), SEP, bytes(kidId))));
    }

    /** Constant-time compare of a stored witness against the one {@code (salt, issuerId, kidId)} yields. */
    public boolean witnessMatches(String storedWitnessB64, byte[] salt, String issuerId, String kidId) {
        byte[] expected = mac(witnessKey, concat(salt, SEP, bytes(issuerId), SEP, bytes(kidId)));
        byte[] stored;
        try {
            stored = Base64.getDecoder().decode(storedWitnessB64);
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(stored, expected);
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] infoBlock(String label) {
        return concat(bytes(label), (byte) 0x01);
    }

    private static byte[] concat(Object... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (Object part : parts) {
            if (part instanceof byte[] array) {
                out.writeBytes(array);
            } else if (part instanceof Byte b) {
                out.write(b);
            } else {
                throw new IllegalArgumentException("Unsupported part " + part);
            }
        }
        return out.toByteArray();
    }

    private static String base64Url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    private static byte[] hmac(byte[] key, byte[] message) {
        return mac(new SecretKeySpec(key, HMAC_SHA256), message);
    }

    private static byte[] mac(SecretKeySpec key, byte[] message) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(key);
            return mac.doFinal(message);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Failed to compute HMAC-SHA256", e);
        }
    }
}
