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
package cloud.imagey.domain.token;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;
import java.util.Date;
import java.util.Optional;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

@MonoMeecrowaveConfig
public class TokenServiceTest {

    private TokenService tokenService;
    private String sharedSecret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 bytes base64 encoded for HS256

    @BeforeEach
    void setUp() throws Exception {
        tokenService = new TokenService();
        // Set private field sharedSecret using reflection because there is no setter
        java.lang.reflect.Field field = TokenService.class.getDeclaredField("sharedSecret");
        field.setAccessible(true);
        field.set(tokenService, sharedSecret);
    }

    @Test
    @DisplayName("Decode token with invalid signature")
    public void testDecodeInvalidSignature() throws Exception {
        JWSSigner signer = new MACSigner(Base64.getDecoder().decode("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="));
        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder().subject("mary@imagey.cloud").issuer("https://imagey.cloud")
            .expirationTime(new Date(System.currentTimeMillis() + 10000)).build();
        SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimsSet);
        signedJWT.sign(signer);
        Token token = new Token(signedJWT.serialize());

        Optional<DecodedToken> decoded = tokenService.decode(token);
        assertThat(decoded).isEmpty();
    }

    @Test
    @DisplayName("Decode token with wrong issuer")
    public void testDecodeWrongIssuer() throws Exception {
        JWSSigner signer = new MACSigner(Base64.getDecoder().decode(sharedSecret));
        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder().subject("mary@imagey.cloud").issuer("https://wrong.issuer")
            .expirationTime(new Date(System.currentTimeMillis() + 10000)).build();
        SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimsSet);
        signedJWT.sign(signer);
        Token token = new Token(signedJWT.serialize());

        Optional<DecodedToken> decoded = tokenService.decode(token);
        assertThat(decoded).isEmpty();
    }

    @Test
    @DisplayName("Decode expired token")
    public void testDecodeExpiredToken() throws Exception {
        JWSSigner signer = new MACSigner(Base64.getDecoder().decode(sharedSecret));
        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder().subject("mary@imagey.cloud").issuer("https://imagey.cloud")
            .expirationTime(new Date(System.currentTimeMillis() - 10000)).build(); // Expired 10 seconds ago
        SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimsSet);
        signedJWT.sign(signer);
        Token token = new Token(signedJWT.serialize());

        Optional<DecodedToken> decoded = tokenService.decode(token);
        assertThat(decoded).isEmpty();
    }

    @Test
    @DisplayName("Decode invalid token format")
    public void testDecodeInvalidFormat() {
        Token token = new Token("invalid.token.format");
        Optional<DecodedToken> decoded = tokenService.decode(token);
        assertThat(decoded).isEmpty();
    }

    @Test
    @DisplayName("Generate token throws exception for invalid key")
    public void testGenerateTokenJoseException() throws Exception {
        // Set invalid shared secret (too short for HS256, needs to be at least 256 bits / 32 bytes)
        java.lang.reflect.Field field = TokenService.class.getDeclaredField("sharedSecret");
        field.setAccessible(true);
        field.set(tokenService, Base64.getEncoder().encodeToString("short-secret".getBytes()));

        try {
            tokenService.generateToken(new cloud.imagey.domain.user.User(new cloud.imagey.domain.mail.Email("mary@imagey.cloud")), 10000);
            org.junit.jupiter.api.Assertions.fail("Should have thrown IllegalStateException");
        } catch (IllegalStateException e) {
            assertThat(e.getCause()).isInstanceOf(com.nimbusds.jose.JOSEException.class);
        }
    }
}
