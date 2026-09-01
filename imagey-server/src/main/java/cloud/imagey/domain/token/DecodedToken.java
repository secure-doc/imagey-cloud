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

import java.text.ParseException;
import java.util.Optional;

import com.nimbusds.jwt.JWTClaimsSet;

import cloud.imagey.domain.token.TokenService.TokenType;

public record DecodedToken(JWTClaimsSet jwt) {

    /** The token's declared {@link TokenType}, or empty if it carries no / an unknown type claim. */
    public Optional<TokenType> type() {
        try {
            return Optional.ofNullable(jwt.getStringClaim(TokenService.TYPE_CLAIM)).map(TokenType::valueOf);
        } catch (ParseException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    /** Whether this token is of the expected {@link TokenType}. */
    public boolean isOfType(TokenType expected) {
        return type().filter(expected::equals).isPresent();
    }
}
