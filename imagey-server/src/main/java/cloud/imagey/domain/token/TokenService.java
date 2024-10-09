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

import static java.util.Optional.empty;

import java.text.ParseException;
import java.util.Base64;
import java.util.Date;
import java.util.Optional;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

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

    public static final long ONE_HOUR = 24 * 60 * 60 * 1000;
    public static final long ONE_DAY = 24 * 60 * 60 * 1000;
    private static final String ISSUER = "https://imagey.cloud";

    @Inject
    @ConfigProperty(name = "authentication.secret")
    private String sharedSecret;

    public Token generateToken(User user, long validityInMilliseconds) {
        try {
            JWSSigner signer = new MACSigner(Base64.getDecoder().decode(sharedSecret));
            JWTClaimsSet claimsSet = new JWTClaimsSet.Builder().subject(user.email().address()).issuer(ISSUER)
                .expirationTime(new Date(System.currentTimeMillis() + validityInMilliseconds)).build();
            SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimsSet);
            signedJWT.sign(signer);
            return new Token(signedJWT.serialize());
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    public Email extractEmail(Token token) {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token.token());
            return new Email(signedJWT.getJWTClaimsSet().getSubject());
        } catch (ParseException e) {
            throw new IllegalArgumentException("email could not extracted", e);
        }
    }

    public boolean verify(Token token, User user) {
        Optional<DecodedToken> decoded = decode(token);
        if (decoded.isEmpty()) {
            return false;
        }
        if (!user.email().address().equals(decoded.get().jwt().getSubject())) {
            return false;
        }
        return true;
    }

    public Optional<DecodedToken> decode(Token token) {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token.token());
            JWSVerifier verifier = new MACVerifier(Base64.getDecoder().decode(sharedSecret));
            if (!signedJWT.verify(verifier)) {
                return empty();
            }
            if (!ISSUER.equals(signedJWT.getJWTClaimsSet().getIssuer())) {
                return empty();
            }
            if (!new Date().before(signedJWT.getJWTClaimsSet().getExpirationTime())) {
                return empty();
            }
            return Optional.of(new DecodedToken(signedJWT.getJWTClaimsSet()));
        } catch (JOSEException | ParseException e) {
            return empty();
        }
    }
}
