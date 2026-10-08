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

import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.infrastructure.federation.FederationDomain;
import cloud.imagey.infrastructure.federation.ReplayCache;

/**
 * Checks the assertion of a foreign server (ADR 0013 decisions 2 and 3, amendment A3). Every refusal
 * is an {@link InvalidAssertion} whose reason is for the log only.
 *
 * <p>The order matters: the cheap structural checks come first, the signature next. The {@code jti} is
 * remembered ({@link #markUsed}) only at the very end, after the session was granted.
 */
@ApplicationScoped
public class FederationAssertionVerifier {

    private static final int MAX_ASSERTION_LENGTH = 4096;
    private static final int MAX_CLAIM_LENGTH = 128;
    private static final Duration TOLERANCE = Duration.ofSeconds(30);
    private static final Duration MAX_LIFETIME = Duration.ofSeconds(120);
    private static final int REPLAY_CAPACITY = 10_000;
    // One issuer may use a tenth of the cache: more than 6 assertions a second sustained is not a person
    private static final int REPLAY_PER_ISSUER = 1_000;

    @Inject
    private FederationSettings settings;

    @Inject
    private FederationKeyResolver resolver;

    @Inject
    private Clock clock;

    private final ReplayCache replayCache = new ReplayCache(REPLAY_CAPACITY, REPLAY_PER_ISSUER);

    public FederationAssertionVerifier() {
    }

    public FederationAssertionVerifier(FederationSettings settings, FederationKeyResolver resolver, Clock clock) {
        this.settings = settings;
        this.resolver = resolver;
        this.clock = clock;
    }

    public VerifiedAssertion verify(String assertion) {
        if (!settings.enabled()) {
            throw new InvalidAssertion("federation is off");
        }
        SignedJWT jwt = parse(assertion);
        JWTClaimsSet claims = claims(jwt);
        String iss = issuer(claims);
        checkAudience(claims);
        Instant now = clock.instant();
        Instant expires = checkTimes(claims, now);
        String jti = claims.getJWTID();
        if (invalid(jti)) {
            throw new InvalidAssertion("jti missing or too long");
        }
        Email sub = FederationAddress.parse(claims.getSubject())
            .orElseThrow(() -> new InvalidAssertion("sub is no address"));
        checkSignature(jwt, iss);
        return new VerifiedAssertion(iss, sub, jti, expires);
    }

    /**
     * Makes the assertion single use. To be called only once it let somebody in: an assertion that is
     * refused afterwards (no invitation, no mapping) must not take a place in the cache, or a server
     * with a valid key could fill it with such assertions. Throws if the assertion was used already, or
     * the cache is full.
     */
    public void markUsed(VerifiedAssertion assertion) {
        Instant now = clock.instant();
        if (!replayCache.register(assertion.iss(), assertion.jti(), assertion.expires().plus(TOLERANCE), now)) {
            throw new InvalidAssertion("replayed or cache full");
        }
    }

    private static boolean invalid(String claim) {
        return claim == null || claim.isEmpty() || claim.length() > MAX_CLAIM_LENGTH;
    }

    private static SignedJWT parse(String assertion) {
        if (assertion == null || assertion.length() > MAX_ASSERTION_LENGTH) {
            throw new InvalidAssertion("assertion missing or too long");
        }
        try {
            SignedJWT jwt = SignedJWT.parse(assertion);
            if (!JWSAlgorithm.ES256.equals(jwt.getHeader().getAlgorithm())) {
                throw new InvalidAssertion("alg is not ES256");
            }
            if (jwt.getHeader().getType() == null || !FederationAssertionService.TYPE.equals(jwt.getHeader().getType().getType())) {
                throw new InvalidAssertion("wrong typ");
            }
            String kid = jwt.getHeader().getKeyID();
            if (invalid(kid)) {
                throw new InvalidAssertion("kid missing or too long");
            }
            return jwt;
        } catch (ParseException e) {
            throw new InvalidAssertion("not a signed JWT");
        }
    }

    private static JWTClaimsSet claims(SignedJWT jwt) {
        try {
            return jwt.getJWTClaimsSet();
        } catch (ParseException e) {
            throw new InvalidAssertion("claims unreadable");
        }
    }

    private String issuer(JWTClaimsSet claims) {
        String iss = FederationDomain.normalize(claims.getIssuer()).orElseThrow(() -> new InvalidAssertion("iss invalid"));
        if (settings.ownDomains().contains(iss)) {
            throw new InvalidAssertion("iss is this server");
        }
        return iss;
    }

    private void checkAudience(JWTClaimsSet claims) {
        List<String> audience = claims.getAudience();
        if (audience.size() != 1 || !settings.ownDomains().contains(audience.get(0).toLowerCase(Locale.ROOT))) {
            throw new InvalidAssertion("aud is not this server alone");
        }
    }

    private static Instant checkTimes(JWTClaimsSet claims, Instant now) {
        if (claims.getIssueTime() == null || claims.getExpirationTime() == null) {
            throw new InvalidAssertion("iat or exp missing");
        }
        Instant issued = claims.getIssueTime().toInstant();
        Instant expires = claims.getExpirationTime().toInstant();
        if (issued.isAfter(now.plus(TOLERANCE))) {
            throw new InvalidAssertion("iat in the future");
        }
        if (!expires.isAfter(now.minus(TOLERANCE))) {
            throw new InvalidAssertion("expired");
        }
        if (Duration.between(issued, expires).compareTo(MAX_LIFETIME) > 0) {
            throw new InvalidAssertion("lifetime too long");
        }
        return expires;
    }

    private void checkSignature(SignedJWT jwt, String iss) {
        Optional<ECKey> key = resolver.resolve(iss, jwt.getHeader().getKeyID());
        if (key.isEmpty()) {
            throw new InvalidAssertion("no key for " + iss);
        }
        try {
            if (!jwt.verify(new ECDSAVerifier(key.get()))) {
                throw new InvalidAssertion("signature invalid");
            }
        } catch (JOSEException e) {
            throw new InvalidAssertion("signature not checkable");
        }
    }
}
