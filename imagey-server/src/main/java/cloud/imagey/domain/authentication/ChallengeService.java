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
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.text.ParseException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.ValidationException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;

import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.DeviceRepository;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserRepository;

@ApplicationScoped
public class ChallengeService {

    private static final Logger LOG = LogManager.getLogger(ChallengeService.class);
    private static final int EXPIRATION_MINUTES = 5;
    private static final int AES_KEY_LENGTH = 32;
    private static final int IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    @Inject
    private UserRepository userRepository;
    @Inject
    private DeviceRepository deviceRepository;

    private final Map<DeviceId, ChallengeContext> challenges = new ConcurrentHashMap<>();

    public ChallengeResponse createChallenge(User user, DeviceId deviceId) {
        if (!userRepository.exists(user)) {
            throw new ValidationException();
        }
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

    public void verifyChallenge(User user, DeviceId deviceId, ChallengeSignature challenge) {
        Optional<PublicKey> devicePublicKey = deviceRepository.loadDevicePublicKey(user, deviceId, new Kid("0"));
        PublicKey publicKey = devicePublicKey.orElseThrow(ValidationException::new);
        ChallengeContext context = challenges.remove(deviceId);
        if (context == null) {
            LOG.warn("No challenge found for device {}", deviceId.id());
            throw new ValidationException("No Challenge found");
        }
        if (Instant.now().isAfter(context.expiresAt())) {
            LOG.warn("Challenge expired for device {}", deviceId.id());
            throw new ValidationException("No Challenge found");
        }

        try {
            ECKey clientKey = ECKey.parse(publicKey.key());
            var clientPublicKey = clientKey.toPublicKey();
            PrivateKey serverPrivateKey = context.serverKeyPair().toPrivateKey();

            KeyAgreement ka = KeyAgreement.getInstance("ECDH");
            ka.init(serverPrivateKey);
            ka.doPhase(clientPublicKey, true);
            byte[] sharedSecret = ka.generateSecret();

            // WebCrypto deriveKey with ECDH P-256 and AES-GCM 256 uses the 32-byte X coordinate
            byte[] aesKeyBytes = Arrays.copyOf(sharedSecret, AES_KEY_LENGTH);
            SecretKey aesKey = new SecretKeySpec(aesKeyBytes, "AES");

            byte[] combined = Base64.getDecoder().decode(challenge.signature());
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_LENGTH);
            byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH, combined.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, aesKey, spec);

            byte[] plaintext = cipher.doFinal(ciphertext);
            String decryptedNonce = new String(plaintext, StandardCharsets.UTF_8);

            if (!context.nonce().equals(decryptedNonce)) {
                throw new ValidationException("Wrong challenge");
            }
        } catch (IllegalArgumentException | GeneralSecurityException | ParseException | JOSEException e) {
            throw new ValidationException(e);
        }
    }

    public record ChallengeContext(String nonce, ECKey serverKeyPair, Instant expiresAt) { }
    public record ChallengeResponse(String nonce, Map<String, Object> ephemeralPublicKey) { }
}
