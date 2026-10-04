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

import static java.nio.charset.StandardCharsets.US_ASCII;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Encrypts a Web Push message body per RFC 8291 (message encryption) layered on RFC 8188's {@code
 * aes128gcm} content encoding, as a single record - JDK crypto only, no third-party web-push library.
 * Verified byte-for-byte against the RFC 8291 Appendix A test vector (see {@code WebPushEncryptionTest}).
 */
public final class WebPushEncryption {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String AES_GCM_ALGORITHM = "AES/GCM/NoPadding";
    private static final String AES_ALGORITHM = "AES";
    private static final String ECDH_ALGORITHM = "ECDH";

    private static final byte[] AGREEMENT_INFO_PREFIX = "WebPush: info".getBytes(US_ASCII);
    private static final byte[] CEK_INFO = "Content-Encoding: aes128gcm".getBytes(US_ASCII);
    private static final byte[] NONCE_INFO = "Content-Encoding: nonce".getBytes(US_ASCII);
    private static final byte[] ZERO_OCTET = {0};
    private static final byte[] HKDF_EXPAND_COUNTER_ONE = {1};

    /** IKM output of the RFC 8291 §3.3 "combined secrets" HKDF step - the aes128gcm "secret" input. */
    private static final int IKM_LENGTH = 32;
    private static final int SALT_LENGTH = 16;
    private static final int CEK_LENGTH = 16;
    private static final int NONCE_LENGTH = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;
    /** The single-record aes128gcm header's record-size field - see RFC 8188 §2, in octets. */
    private static final int RECORD_SIZE = 4096;
    /** RFC 8188 §2: appended to the plaintext before encryption; there is exactly one record here. */
    private static final byte PADDING_DELIMITER = 2;

    private WebPushEncryption() {
    }

    /**
     * Encrypts {@code plaintext} to the subscriber identified by {@code p256dh} (their uncompressed
     * P-256 public key, 65 bytes) and {@code authSecret} (16 bytes), with a fresh random salt and
     * ephemeral sender key pair for every call - reusing either would let the push service correlate
     * or, worse, let an observer recover the plaintext of a future message.
     *
     * @return the complete {@code Content-Encoding: aes128gcm} HTTP body
     */
    public static byte[] encrypt(byte[] plaintext, byte[] p256dh, byte[] authSecret) {
        try {
            SecureRandom random = new SecureRandom();
            byte[] salt = new byte[SALT_LENGTH];
            random.nextBytes(salt);
            KeyPair ephemeral = EcKeys.generate();
            return encrypt(plaintext, p256dh, authSecret, salt,
                (ECPublicKey) ephemeral.getPublic(), (ECPrivateKey) ephemeral.getPrivate());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt the Web Push payload", e);
        }
    }

    /** Package-visible for {@code WebPushEncryptionTest}'s fixed-salt/fixed-key RFC 8291 test vector. */
    static byte[] encrypt(
        byte[] plaintext, byte[] uaPublicBytes, byte[] authSecret, byte[] salt,
        ECPublicKey senderPublic, ECPrivateKey senderPrivate) throws GeneralSecurityException {

        ECPublicKey uaPublic = EcKeys.toPublicKey(uaPublicBytes);
        byte[] senderPublicBytes = EcKeys.encodePoint(senderPublic);

        byte[] ecdhSecret = ecdh(senderPrivate, uaPublic);
        byte[] prkKey = hmacSha256(authSecret, ecdhSecret);
        byte[] keyInfo = concat(AGREEMENT_INFO_PREFIX, ZERO_OCTET, uaPublicBytes, senderPublicBytes);
        byte[] ikm = hkdfExpand(prkKey, keyInfo, IKM_LENGTH);

        byte[] prk = hmacSha256(salt, ikm);
        byte[] cek = hkdfExpand(prk, concat(CEK_INFO, ZERO_OCTET), CEK_LENGTH);
        byte[] nonce = hkdfExpand(prk, concat(NONCE_INFO, ZERO_OCTET), NONCE_LENGTH);

        byte[] paddedPlaintext = concat(plaintext, new byte[] {PADDING_DELIMITER});
        byte[] ciphertext = aesGcmEncrypt(cek, nonce, paddedPlaintext);

        return concat(header(salt, senderPublicBytes), ciphertext);
    }

    private static byte[] header(byte[] salt, byte[] senderPublicBytes) {
        ByteBuffer buffer = ByteBuffer.allocate(salt.length + Integer.BYTES + 1 + senderPublicBytes.length);
        buffer.put(salt);
        buffer.putInt(RECORD_SIZE);
        buffer.put((byte) senderPublicBytes.length);
        buffer.put(senderPublicBytes);
        return buffer.array();
    }

    private static byte[] ecdh(ECPrivateKey privateKey, ECPublicKey publicKey) throws GeneralSecurityException {
        KeyAgreement agreement = KeyAgreement.getInstance(ECDH_ALGORITHM);
        agreement.init(privateKey);
        agreement.doPhase(publicKey, true);
        return agreement.generateSecret();
    }

    private static byte[] hmacSha256(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(key, HMAC_ALGORITHM));
        return mac.doFinal(data);
    }

    /** HKDF-Expand (RFC 5869), for the single-block case this scheme only ever needs ({@code length <= 32}). */
    private static byte[] hkdfExpand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        byte[] block = hmacSha256(prk, concat(info, HKDF_EXPAND_COUNTER_ONE));
        return Arrays.copyOf(block, length);
    }

    private static byte[] aesGcmEncrypt(byte[] key, byte[] nonce, byte[] plaintext) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance(AES_GCM_ALGORITHM);
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, AES_ALGORITHM),
            new GCMParameterSpec(GCM_TAG_LENGTH_BITS, nonce));
        return cipher.doFinal(plaintext);
    }

    private static byte[] concat(byte[]... parts) {
        int length = 0;
        for (byte[] part : parts) {
            length += part.length;
        }
        byte[] result = new byte[length];
        int position = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, result, position, part.length);
            position += part.length;
        }
        return result;
    }
}
