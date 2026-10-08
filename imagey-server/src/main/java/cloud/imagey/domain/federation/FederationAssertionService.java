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
package cloud.imagey.domain.federation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import cloud.imagey.domain.mail.Email;

/**
 * Signs the assertion with which a logged-in user of this server proves to another server that they
 * own an address (ADR 0013 decision 2): ES256, valid for one minute, for exactly one audience, with a
 * unique {@code jti} against replay. The own {@code typ} keeps any other JWT from passing as one.
 */
@ApplicationScoped
public class FederationAssertionService {

    /** The {@code typ} header of an assertion. */
    public static final String TYPE = "fed-assertion+jwt";
    /** How long an assertion lives. */
    public static final Duration LIFETIME = Duration.ofSeconds(60);

    @Inject
    private FederationSigningKey signingKey;

    @Inject
    private Clock clock;

    public FederationAssertionService() {
    }

    public FederationAssertionService(FederationSigningKey signingKey, Clock clock) {
        this.signingKey = signingKey;
        this.clock = clock;
    }

    /** The compact JWS: {@code iss} (this server) vouches that {@code address} is logged in, for {@code aud} only. */
    public String mint(String iss, Email address, String aud) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .issuer(iss)
            .subject(address.address())
            .audience(aud)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plus(LIFETIME)))
            .jwtID(UUID.randomUUID().toString())
            .build();
        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.ES256)
            .keyID(signingKey.privateKey().getKeyID())
            .type(new JOSEObjectType(TYPE))
            .build();
        try {
            SignedJWT jwt = new SignedJWT(header, claims);
            jwt.sign(new ECDSASigner(signingKey.privateKey()));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Assertion could not be signed", e);
        }
    }
}
