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

import static java.lang.System.currentTimeMillis;
import static java.util.Optional.empty;

import java.util.Base64;
import java.util.Date;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

@ApplicationScoped
public class TokenService {

    public static final long ONE_HOUR = 60 * 60 * 1000;
    public static final long ONE_DAY = 24 * ONE_HOUR;
    public static final long ONE_WEEK = 7 * ONE_DAY;
    public static final long ONE_MONTH = 30 * ONE_DAY;

    /** Claim name carrying the {@link TokenType} of a token. */
    public static final String TYPE_CLAIM = "type";

    private static final Logger LOG = LogManager.getLogger(TokenService.class);
    private static final String ISSUER = "https://imagey.cloud";

    /**
     * What a token is for. The pre-authentication tokens ({@code REGISTRATION}, {@code LOGIN},
     * {@code INVITATION}) travel in emailed links and carry the <em>email address</em> as subject,
     * because the account's {@link User#id() UserId} is not known yet (or not to the recipient).
     * The {@code AUTHENTICATION} token is the session cookie and carries the {@code UserId}.
     */
    public enum TokenType {
        REGISTRATION, LOGIN, INVITATION, AUTHENTICATION
    }

    @Inject
    @ConfigProperty(name = "authentication.secret")
    private String sharedSecret;

    /** Session cookie for an authenticated user; subject = {@link User#id()}. */
    public Token generateAuthenticationToken(User user, long validityInMilliseconds) {
        return generate(user.id().id(), TokenType.AUTHENTICATION, validityInMilliseconds);
    }

    /** Emailed link that finishes first-time registration; subject = email address. */
    public Token generateRegistrationToken(Email email, long validityInMilliseconds) {
        return generate(email.address(), TokenType.REGISTRATION, validityInMilliseconds);
    }

    /** Emailed link that signs an existing user in; subject = email address. */
    public Token generateLoginToken(Email email, long validityInMilliseconds) {
        return generate(email.address(), TokenType.LOGIN, validityInMilliseconds);
    }

    /** Emailed link that lets an invited, not-yet-registered address join; subject = email address. */
    public Token generateInvitationToken(Email email, long validityInMilliseconds) {
        return generate(email.address(), TokenType.INVITATION, validityInMilliseconds);
    }

    private Token generate(String subject, TokenType type, long validityInMilliseconds) {
        LOG.info("Generate {} token with validity {}", type, validityInMilliseconds);
        try {
            JWSSigner signer = new MACSigner(Base64.getDecoder().decode(sharedSecret));
            JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                .subject(subject)
                .issuer(ISSUER)
                .claim(TYPE_CLAIM, type.name())
                .expirationTime(new Date(System.currentTimeMillis() + validityInMilliseconds))
                .build();
            SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimsSet);
            signedJWT.sign(signer);
            LOG.info("Token generated.");
            return new Token(signedJWT.serialize());
        } catch (JOSEException e) {
            LOG.error("Token could not be generated", e);
            throw new IllegalStateException(e);
        }
    }

    public Optional<DecodedToken> decode(Token token) {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token.token());
            JWSVerifier verifier = new MACVerifier(Base64.getDecoder().decode(sharedSecret));
            if (!signedJWT.verify(verifier)) {
                LOG.info("Signature invalid");
                return empty();
            }
            if (!ISSUER.equals(signedJWT.getJWTClaimsSet().getIssuer())) {
                LOG.info("Wrong issuer");
                return empty();
            }
            Date expirationTime = signedJWT.getJWTClaimsSet().getExpirationTime();
            if (!new Date().before(expirationTime)) {
                LOG.info("Token expired, current time: {}, expiration time: {}", currentTimeMillis(), expirationTime.getTime());
                return empty();
            }
            return Optional.of(new DecodedToken(signedJWT.getJWTClaimsSet()));
        } catch (Exception e) {
            LOG.warn("Token not valid", e);
            return empty();
        }
    }
}
