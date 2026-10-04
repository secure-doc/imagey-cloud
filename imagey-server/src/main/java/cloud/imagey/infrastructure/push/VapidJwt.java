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

import java.time.Instant;
import java.util.Date;
import java.util.List;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * The VAPID authentication header (RFC 8292): an ES256-signed JWT identifying this server to the push
 * service, plus its own public key so the push service can verify it without a prior handshake.
 */
public final class VapidJwt {

    private static final String AUTHORIZATION_SCHEME = "vapid";

    private VapidJwt() {
    }

    /** {@code Authorization} header value for a push request to a service whose origin is {@code audience}. */
    public static String authorizationHeader(VapidKeys keys, String audience, Instant expiresAt) {
        return AUTHORIZATION_SCHEME + " t=" + create(keys, audience, expiresAt) + ", k=" + keys.publicKeyBase64Url();
    }

    static String create(VapidKeys keys, String audience, Instant expiresAt) {
        try {
            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .audience(List.of(audience))
                .expirationTime(Date.from(expiresAt))
                .subject(keys.subject())
                .build();
            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.ES256), claims);
            jwt.sign(new ECDSASigner(keys.privateKey()));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Failed to sign the VAPID JWT", e);
        }
    }
}
