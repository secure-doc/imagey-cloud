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
package cloud.imagey.domain.authentication;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.enterprise.context.ApplicationScoped;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;

import cloud.imagey.domain.user.DeviceId;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@ApplicationScoped
public class ChallengeService {

    private static final Logger LOG = LogManager.getLogger(ChallengeService.class);
    private static final int EXPIRATION_MINUTES = 5;
    private static final int AES_KEY_LENGTH = 32;
    private static final int IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    private final Map<DeviceId, ChallengeContext> challenges = new ConcurrentHashMap<>();

    public ChallengeResponse createChallenge(DeviceId deviceId) {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
            kpg.initialize(new ECGenParameterSpec("secp256r1"));
            KeyPair kp = kpg.generateKeyPair();
            ECKey jwk = new ECKey.Builder(Curve.P_256, (ECPublicKey) kp.getPublic())
                .privateKey((ECPrivateKey) kp.getPrivate())
                .build();

            String nonce = UUID.randomUUID().toString();
            Instant expiresAt = Instant.now().plus(EXPIRATION_MINUTES, ChronoUnit.MINUTES);

            challenges.put(deviceId, new ChallengeContext(nonce, jwk, expiresAt));

            return new ChallengeResponse(nonce, jwk.toPublicJWK().toJSONObject());
        } catch (Exception e) {
            LOG.error("Failed to generate challenge", e);
            throw new RuntimeException("Failed to generate challenge", e);
        }
    }

    public boolean verifyChallenge(DeviceId deviceId, String publicDeviceKeyJwk, String encryptedNonceBase64) {
        ChallengeContext context = challenges.remove(deviceId);
        if (context == null) {
            LOG.warn("No challenge found for device {}", deviceId.id());
            return false;
        }
        if (Instant.now().isAfter(context.expiresAt())) {
            LOG.warn("Challenge expired for device {}", deviceId.id());
            return false;
        }

        try {
            ECKey clientKey = ECKey.parse(publicDeviceKeyJwk);
            PublicKey clientPublicKey = clientKey.toPublicKey();
            PrivateKey serverPrivateKey = context.serverKeyPair().toPrivateKey();

            KeyAgreement ka = KeyAgreement.getInstance("ECDH");
            ka.init(serverPrivateKey);
            ka.doPhase(clientPublicKey, true);
            byte[] sharedSecret = ka.generateSecret();

            // WebCrypto deriveKey with ECDH P-256 and AES-GCM 256 uses the 32-byte X coordinate
            byte[] aesKeyBytes = Arrays.copyOf(sharedSecret, AES_KEY_LENGTH);
            SecretKey aesKey = new SecretKeySpec(aesKeyBytes, "AES");

            byte[] combined = Base64.getDecoder().decode(encryptedNonceBase64);
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_LENGTH);
            byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH, combined.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, aesKey, spec);

            byte[] plaintext = cipher.doFinal(ciphertext);
            String decryptedNonce = new String(plaintext, StandardCharsets.UTF_8);

            return context.nonce().equals(decryptedNonce);

        } catch (Exception e) {
            LOG.error("Failed to verify challenge", e);
            return false;
        }
    }

    public record ChallengeContext(String nonce, ECKey serverKeyPair, Instant expiresAt) { }
    public record ChallengeResponse(String nonce, Map<String, Object> ephemeralPublicKey) { }
}
