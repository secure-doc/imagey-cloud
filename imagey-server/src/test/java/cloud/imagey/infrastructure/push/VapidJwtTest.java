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

import java.lang.reflect.Field;
import java.security.KeyPair;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;

class VapidJwtTest {

    private static final String SUBJECT = "mailto:admin@imagey.cloud";
    private static final String AUDIENCE = "https://push.example.net";

    @Test
    @DisplayName("The JWT verifies with the matching public key and carries aud/exp/sub")
    void createsAVerifiableJwt() throws Exception {
        KeyPair pair = EcKeys.generate();
        VapidKeys keys = keys(pair);
        Instant expiresAt = Instant.now().plus(1, ChronoUnit.HOURS);

        SignedJWT jwt = SignedJWT.parse(VapidJwt.create(keys, AUDIENCE, expiresAt));

        assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) pair.getPublic()))).isTrue();
        assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly(AUDIENCE);
        assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo(SUBJECT);
        assertThat(jwt.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(expiresAt.truncatedTo(ChronoUnit.SECONDS));
    }

    @Test
    @DisplayName("A different key pair does not verify")
    void wrongKeyDoesNotVerify() throws Exception {
        VapidKeys keys = keys(EcKeys.generate());
        KeyPair other = EcKeys.generate();

        SignedJWT jwt = SignedJWT.parse(VapidJwt.create(keys, AUDIENCE, Instant.now().plus(1, ChronoUnit.HOURS)));

        assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) other.getPublic()))).isFalse();
    }

    @Test
    @DisplayName("authorizationHeader carries the vapid scheme, the JWT and the raw public key")
    void authorizationHeaderShape() throws Exception {
        VapidKeys keys = keys(EcKeys.generate());

        String header = VapidJwt.authorizationHeader(keys, AUDIENCE, Instant.now().plus(1, ChronoUnit.HOURS));

        assertThat(header).startsWith("vapid t=").contains(", k=" + keys.publicKeyBase64Url());
    }

    private static VapidKeys keys(KeyPair pair) {
        VapidKeys instance = new VapidKeys();
        setField(instance, "subject", SUBJECT);
        setField(instance, "publicKeyConfig", Optional.of("unused"));
        setField(instance, "privateKeyConfig", Optional.of("unused"));
        setField(instance, "publicKey", pair.getPublic());
        setField(instance, "privateKey", pair.getPrivate());
        return instance;
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
