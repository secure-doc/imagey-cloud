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


import static cloud.imagey.domain.token.TokenService.ONE_HOUR;
import static jakarta.servlet.http.HttpServletResponse.SC_FORBIDDEN;
import static jakarta.servlet.http.HttpServletResponse.SC_NOT_FOUND;

import java.io.IOException;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.domain.user.UserMappingService;
import cloud.imagey.domain.user.UserRepository;

@ApplicationScoped
@WebFilter(urlPatterns = "/authentications/*")
public class AuthenticationFilter extends HttpFilter {

    private static final Logger LOG = LogManager.getLogger(AuthenticationFilter.class);
    @Inject
    private TokenService tokenService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private UserMappingService userMappingService;

    @Override
    public void doFilter(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        LOG.info("Authentication started");
        Token authenticationToken = extractToken(request.getRequestURI());
        Optional<DecodedToken> decoded = tokenService.decode(authenticationToken);
        if (decoded.isEmpty() || !"login".equals(decoded.get().jwt().getClaim("type"))) {
            LOG.info("Decoding not successful or wrong token type");
            response.sendError(SC_FORBIDDEN);
            return;
        }
        Email email = new Email(decoded.get().jwt().getSubject());

        Optional<UserId> optionalUserId = userMappingService.findUserId(email);
        if (optionalUserId.isEmpty()) {
            LOG.info("User mapping not found");
            response.sendError(SC_NOT_FOUND);
            return;
        }

        User user = new User(optionalUserId.get(), email);
        if (!userRepository.exists(user)) {
            LOG.info("User not found in repository");
            response.sendError(SC_NOT_FOUND);
            return;
        }
        Token token = tokenService.generateAuthenticationToken(user, ONE_HOUR);
        response.setHeader("Set-Cookie", "token=" + token.token() + "; HttpOnly; SameSite=strict; Path=/");
        response.sendRedirect("/?email=" + email.address() + "&userId=" + user.id().id());
    }

    private Token extractToken(String requestUri) {
        String authenticationPart = "/authentications/";
        return new Token(requestUri.substring(requestUri.indexOf(authenticationPart) + authenticationPart.length()));
    }
}
