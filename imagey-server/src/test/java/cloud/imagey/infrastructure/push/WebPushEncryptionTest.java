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

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.infrastructure.common.Base64Url;

class WebPushEncryptionTest {

    // RFC 8291 Appendix A: fixed inputs (salt, sender ephemeral key pair) so the encryption is
    // reproducible, and every intermediate/final value the RFC gives.
    private static final String PLAINTEXT_B64 = "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24";
    private static final String SALT_B64 = "DGv6ra1nlYgDCS1FRnbzlw";
    private static final String AUTH_SECRET_B64 = "BTBZMqHH6r4Tts7J_aSIgg";
    private static final String UA_PUBLIC_B64 =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    private static final String AS_PUBLIC_B64 =
        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    private static final String AS_PRIVATE_B64 = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    private static final String EXPECTED_BODY_B64 = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml"
        + "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVW"
        + "GNWQexSgSxsj_Qulcy4a-fN";

    private static final int SALT_LENGTH = 16;
    private static final int RECORD_SIZE_FIELD_LENGTH = 4;
    private static final int KEY_ID_LENGTH_FIELD_LENGTH = 1;
    private static final int UNCOMPRESSED_POINT_LENGTH = 65;
    private static final int HEADER_LENGTH =
        SALT_LENGTH + RECORD_SIZE_FIELD_LENGTH + KEY_ID_LENGTH_FIELD_LENGTH + UNCOMPRESSED_POINT_LENGTH;
    private static final int GCM_TAG_LENGTH = 16;

    @Test
    @DisplayName("Matches the RFC 8291 Appendix A test vector byte-for-byte")
    void matchesRfc8291Vector() throws GeneralSecurityException {
        byte[] plaintext = Base64Url.decode(PLAINTEXT_B64);
        byte[] salt = Base64Url.decode(SALT_B64);
        byte[] authSecret = Base64Url.decode(AUTH_SECRET_B64);
        byte[] uaPublic = Base64Url.decode(UA_PUBLIC_B64);
        ECPublicKey senderPublic = EcKeys.toPublicKey(Base64Url.decode(AS_PUBLIC_B64));
        ECPrivateKey senderPrivate = EcKeys.toPrivateKey(Base64Url.decode(AS_PRIVATE_B64));

        byte[] body = WebPushEncryption.encrypt(plaintext, uaPublic, authSecret, salt, senderPublic, senderPrivate);

        assertThat(Base64Url.encode(body)).isEqualTo(EXPECTED_BODY_B64);
    }

    @Test
    @DisplayName("The public entry point encrypts with a fresh salt and ephemeral key, header shaped as RFC 8188 requires")
    void publicEntryPointProducesAWellFormedRecord() throws GeneralSecurityException {
        KeyPair receiver = EcKeys.generate();
        byte[] receiverPublicBytes = EcKeys.encodePoint((ECPublicKey) receiver.getPublic());
        byte[] authSecret = new byte[SALT_LENGTH];
        new SecureRandom().nextBytes(authSecret);
        byte[] plaintext = "hello push".getBytes(StandardCharsets.UTF_8);

        byte[] first = WebPushEncryption.encrypt(plaintext, receiverPublicBytes, authSecret);
        byte[] second = WebPushEncryption.encrypt(plaintext, receiverPublicBytes, authSecret);

        assertThat(first).hasSizeGreaterThan(HEADER_LENGTH);
        assertThat(first[SALT_LENGTH + RECORD_SIZE_FIELD_LENGTH]).isEqualTo((byte) UNCOMPRESSED_POINT_LENGTH);
        assertThat(first.length).isEqualTo(plaintext.length + 1 + GCM_TAG_LENGTH + HEADER_LENGTH);
        // A fresh salt and ephemeral sender key on every call - reusing either would be a real
        // vulnerability (it would let a push service correlate messages, or worse).
        assertThat(first).isNotEqualTo(second);
    }
}
