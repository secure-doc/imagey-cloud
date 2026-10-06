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
package cloud.imagey.infrastructure.federation;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Optional;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Encrypts the private federation signing key at rest (ADR 0013 decision 1): AES-256-GCM under a key
 * derived with HKDF-SHA256 from the configured secret, so that no further secret has to be deployed.
 * A blob is {@code IV || ciphertext+tag}. Whoever only steals the storage cannot sign as the server.
 */
public final class SigningKeyCipher {

    private static final String HMAC = "HmacSHA256";
    private static final String AES = "AES";
    private static final String GCM = "AES/GCM/NoPadding";
    private static final byte[] INFO = "federation-signing-key".getBytes(StandardCharsets.UTF_8);
    private static final int KEY_LENGTH = 32;
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private SigningKeyCipher() {
    }

    public static byte[] encrypt(String secret, byte[] plain) {
        try {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(GCM);
            cipher.init(Cipher.ENCRYPT_MODE, key(secret), new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(plain);
            byte[] blob = Arrays.copyOf(iv, IV_LENGTH + encrypted.length);
            System.arraycopy(encrypted, 0, blob, IV_LENGTH, encrypted.length);
            return blob;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot encrypt the federation signing key", e);
        }
    }

    /** The plain text, or empty if the blob was not encrypted under {@code secret} or was tampered with. */
    public static Optional<byte[]> decrypt(String secret, byte[] blob) {
        if (blob.length <= IV_LENGTH) {
            return Optional.empty();
        }
        try {
            Cipher cipher = Cipher.getInstance(GCM);
            cipher.init(Cipher.DECRYPT_MODE, key(secret), new GCMParameterSpec(TAG_BITS, blob, 0, IV_LENGTH));
            return Optional.of(cipher.doFinal(blob, IV_LENGTH, blob.length - IV_LENGTH));
        } catch (GeneralSecurityException e) {
            return Optional.empty();
        }
    }

    // HKDF-SHA256 with an all-zero salt and a single output block (32 bytes = one AES-256 key)
    private static SecretKeySpec key(String secret) throws GeneralSecurityException {
        Mac mac = Mac.getInstance(HMAC);
        mac.init(new SecretKeySpec(new byte[KEY_LENGTH], HMAC));
        byte[] pseudoRandomKey = mac.doFinal(secret.getBytes(StandardCharsets.UTF_8));
        mac.init(new SecretKeySpec(pseudoRandomKey, HMAC));
        mac.update(INFO);
        mac.update((byte) 1);
        return new SecretKeySpec(mac.doFinal(), AES);
    }
}
