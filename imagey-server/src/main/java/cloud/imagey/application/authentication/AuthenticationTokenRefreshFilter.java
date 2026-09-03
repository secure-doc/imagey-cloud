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
package cloud.imagey.application.authentication;

import static java.util.Optional.ofNullable;

import java.util.Date;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.ext.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.token.TokenService.TokenType;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

/**
 * Slides an active "keep me logged in" session forward. Whenever a request carries a still-valid
 * {@code trusted} authentication cookie that is more than a day old, the response re-issues a fresh
 * month-long cookie. Without this a trusted session would hard-expire exactly one month after the
 * last password entry, however actively it was used - which on mobile (where every app resume is a
 * full reload) means being thrown back to the password prompt.
 *
 * <p>Untrusted sessions (the one-hour cookie from an emailed link) carry no {@link
 * TokenService#TRUSTED_CLAIM} and are deliberately left to expire.
 */
@Provider
@ApplicationScoped
public class AuthenticationTokenRefreshFilter implements ContainerResponseFilter {

    private static final Logger LOG = LogManager.getLogger(AuthenticationTokenRefreshFilter.class);

    /** Re-issue once the running cookie has less than this long left (i.e. is older than a day). */
    private static final long REFRESH_WHEN_REMAINING_BELOW = TokenService.ONE_MONTH - TokenService.ONE_DAY;

    @Inject
    private TokenService tokenService;

    @Override
    public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext) {
        if (responseContext.getHeaders().containsKey("Set-Cookie")) {
            // The request is itself a sign-in / sign-out - do not fight its own cookie.
            return;
        }
        Optional<DecodedToken> decoded = ofNullable(requestContext.getCookies().get("token"))
            .map(Cookie::getValue)
            .flatMap(value -> tokenService.decode(new Token(value)))
            .filter(token -> token.isOfType(TokenType.AUTHENTICATION))
            .filter(DecodedToken::isTrusted);
        if (decoded.isEmpty()) {
            return;
        }
        Date expiration = decoded.get().jwt().getExpirationTime();
        if (expiration == null) {
            return;
        }
        long remaining = expiration.getTime() - System.currentTimeMillis();
        if (remaining <= 0 || remaining >= REFRESH_WHEN_REMAINING_BELOW) {
            return;
        }
        User user = new User(new UserId(decoded.get().jwt().getSubject()));
        LOG.info("Refreshing trusted authentication cookie");
        responseContext.getHeaders().add("Set-Cookie", tokenService.authenticationCookie(user, true));
    }
}
