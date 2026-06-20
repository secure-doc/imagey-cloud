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
package cloud.imagey.application;

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static jakarta.ws.rs.client.Entity.json;
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.CREATED;
import static jakarta.ws.rs.core.Response.Status.OK;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;

import cloud.imagey.domain.authentication.ChallengeService.ChallengeResponse;
import cloud.imagey.domain.authentication.ChallengeSignature;

@MonoMeecrowaveConfig
public class ChallengeResourceTest {

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    private KeyPair clientKeyPair;
    private String clientJwkString;

    @BeforeEach
    void initializeDefaultState() throws Exception {
        // Generate a valid client JWK
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));
        clientKeyPair = kpg.generateKeyPair();
        ECPublicKey pub = (ECPublicKey) clientKeyPair.getPublic();
        ECPrivateKey priv = (ECPrivateKey) clientKeyPair.getPrivate();

        ECKey jwk = new ECKey.Builder(Curve.P_256, pub)
            .privateKey(priv)
            .build();
        clientJwkString = jwk.toJSONString();

        File root = new File("./" + rootPath);
        if (!root.exists()) {
            root.mkdirs();
        }

        File joesData = new File(root, "joe@imagey.cloud");
        if (joesData.exists()) {
            forceDelete(joesData);
        }

        File marysData = new File(root, "mary@imagey.cloud");
        if (!marysData.exists()) {
            marysData.mkdirs();
        }
        File marysDevices = new File(marysData, "devices");
        if (!marysDevices.exists()) {
            marysDevices.mkdirs();
        }

        File knownDevice = new File(marysDevices, "known-device");
        if (knownDevice.exists()) {
            forceDelete(knownDevice);
        }
        knownDevice.mkdirs();

        File privateKeys = new File(knownDevice, "private-keys");
        if (!privateKeys.exists()) {
            privateKeys.mkdirs();
        }

        File publicKeys = new File(knownDevice, "public-keys");
        if (!publicKeys.exists()) {
            publicKeys.mkdirs();
        }

        File publicKeyFile = new File(publicKeys, "0.json");
        Files.writeString(publicKeyFile.toPath(), clientJwkString);
    }

    @Test
    @DisplayName("CreateChallenge fails for unknown user")
    void createChallengeUnknownUser() {
        try (Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/unknown@imagey.cloud/devices/known-device/challenges")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(""))) {
            assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
        }
    }

    @Test
    @DisplayName("VerifyChallenge fails for unknown user")
    void verifyChallengeUnknownUser() {
        try (Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/unknown@imagey.cloud/devices/known-device/authentications")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(new ChallengeSignature("invalid-signature")))) {
            assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
        }
    }

    @Test
    @DisplayName("VerifyChallenge fails for unknown device")
    void verifyChallengeUnknownDevice() {
        try (Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/unknown-device/authentications")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(new ChallengeSignature("invalid-signature")))) {
            assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
        }
    }

    @Test
    @DisplayName("VerifyChallenge fails for invalid signature")
    void verifyChallengeInvalidSignature() {
        try (Response createResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/known-device/challenges")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(""))) {
            assertThat(createResponse.getStatus()).isEqualTo(CREATED.getStatusCode());
        }

        try (Response response = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/known-device/authentications")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(new ChallengeSignature("invalid-signature")))) {
            assertThat(response.getStatus()).isEqualTo(BAD_REQUEST.getStatusCode());
        }
    }

    @Test
    @DisplayName("VerifyChallenge succeeds for valid signature")
    void verifyChallengeSuccess() throws Exception {
        ChallengeResponse challenge;
        try (Response createResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/known-device/challenges")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(""))) {
            assertThat(createResponse.getStatus()).isEqualTo(CREATED.getStatusCode());
            challenge = createResponse.readEntity(ChallengeResponse.class);
        }

        ECKey serverEphemeralKey = ECKey.parse(challenge.ephemeralPublicKey());
        PublicKey serverPubKey = serverEphemeralKey.toPublicKey();

        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(clientKeyPair.getPrivate());
        ka.doPhase(serverPubKey, true);
        byte[] sharedSecret = ka.generateSecret();

        byte[] aesKeyBytes = Arrays.copyOf(sharedSecret, 32);
        SecretKey aesKey = new SecretKeySpec(aesKeyBytes, "AES");

        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(128, iv);
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, spec);

        byte[] nonceBytes = challenge.nonce().getBytes(StandardCharsets.UTF_8);
        byte[] ciphertext = cipher.doFinal(nonceBytes);

        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        String signatureBase64 = Base64.getEncoder().encodeToString(combined);

        try (Response verifyResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/known-device/authentications")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(new ChallengeSignature(signatureBase64)))) {
            assertThat(verifyResponse.getStatus()).isEqualTo(OK.getStatusCode());
            assertThat(verifyResponse.getHeaderString("Set-Cookie")).contains("token=");
        }
    }

    @Test
    @DisplayName("VerifyChallenge succeeds for valid signature with trusted device")
    void verifyChallengeTrustedDeviceSuccess() throws Exception {
        ChallengeResponse challenge;
        try (Response createResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/known-device/challenges")
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(""))) {
            assertThat(createResponse.getStatus()).isEqualTo(CREATED.getStatusCode());
            challenge = createResponse.readEntity(ChallengeResponse.class);
        }

        ECKey serverEphemeralKey = ECKey.parse(challenge.ephemeralPublicKey());
        PublicKey serverPubKey = serverEphemeralKey.toPublicKey();

        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(clientKeyPair.getPrivate());
        ka.doPhase(serverPubKey, true);
        byte[] sharedSecret = ka.generateSecret();

        byte[] aesKeyBytes = Arrays.copyOf(sharedSecret, 32);
        SecretKey aesKey = new SecretKeySpec(aesKeyBytes, "AES");

        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(128, iv);
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, spec);

        byte[] nonceBytes = challenge.nonce().getBytes(StandardCharsets.UTF_8);
        byte[] ciphertext = cipher.doFinal(nonceBytes);

        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        String signatureBase64 = Base64.getEncoder().encodeToString(combined);

        try (Response verifyResponse = newClient()
            .target("http://localhost:" + config.getHttpPort())
            .path("users/mary@imagey.cloud/devices/known-device/authentications")
            .queryParam("trusted", true)
            .request()
            .header("Origin", "https://secure-doc.store")
            .post(json(new ChallengeSignature(signatureBase64)))) {
            assertThat(verifyResponse.getStatus()).isEqualTo(OK.getStatusCode());
            assertThat(verifyResponse.getHeaderString("Set-Cookie")).contains("token=");
            assertThat(verifyResponse.getHeaderString("Set-Cookie")).contains("Max-Age=2592000");
        }
    }
}
