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
package cloud.imagey;

import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import java.util.function.Consumer;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * A foreign server for the tests (ADR 0013): it has a key, which {@link TestFederationKeyFetcher}
 * publishes under {@link #DOMAIN}, and it signs assertions - valid ones, or deliberately broken ones.
 */
public final class ForeignServer {

    public static final String DOMAIN = "foreign.test";
    public static final String OWN_AUDIENCE = "imagey.cloud";

    private static final ECKey KEY = generate();

    private ForeignServer() {
    }

    public static ECKey publicKey() {
        return KEY.toPublicJWK();
    }

    /** A valid assertion for {@code sub}, addressed to this server. */
    public static String assertion(String sub) {
        return assertion(sub, OWN_AUDIENCE);
    }

    public static String assertion(String sub, String aud) {
        return assertion(claims -> claims.subject(sub).audience(aud));
    }

    /** An assertion with the claims of a valid one, changed by {@code customizer}, signed with the key of the foreign server. */
    public static String assertion(Consumer<JWTClaimsSet.Builder> customizer) {
        JWTClaimsSet.Builder claims = defaults();
        customizer.accept(claims);
        return sign(claims.build(), header(KEY));
    }

    /** Signs {@code claims} with {@code key} and the given header: for the cases the defaults must not produce. */
    public static String sign(JWTClaimsSet claims, JWSHeader header, ECKey key) {
        try {
            SignedJWT jwt = new SignedJWT(header, claims);
            jwt.sign(new ECDSASigner(key));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    public static JWTClaimsSet.Builder defaults() {
        Instant now = Instant.now();
        return new JWTClaimsSet.Builder()
            .issuer(DOMAIN)
            .audience(OWN_AUDIENCE)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plusSeconds(60)))
            .jwtID(UUID.randomUUID().toString());
    }

    public static JWSHeader header(ECKey key) {
        return new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).type(new JOSEObjectType("fed-assertion+jwt")).build();
    }

    private static String sign(JWTClaimsSet claims, JWSHeader header) {
        return sign(claims, header, KEY);
    }

    public static ECKey generate() {
        try {
            return new ECKeyGenerator(Curve.P_256).keyUse(KeyUse.SIGNATURE).keyIDFromThumbprint(true).generate();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }
}
