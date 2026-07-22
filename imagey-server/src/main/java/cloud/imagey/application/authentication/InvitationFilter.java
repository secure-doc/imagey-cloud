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
import cloud.imagey.domain.user.UserService;

@ApplicationScoped
@WebFilter(urlPatterns = "/invitations/*")
public class InvitationFilter extends HttpFilter {

    private static final Logger LOG = LogManager.getLogger(InvitationFilter.class);
    @Inject
    private TokenService tokenService;
    @Inject
    private UserService userService;

    @Override
    public void doFilter(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        LOG.info("Registration via invitation started");
        Token invitationToken = extractToken(request.getRequestURI());
        Optional<DecodedToken> decoded = tokenService.decode(invitationToken);
        if (decoded.isEmpty()) {
            LOG.warn("Invalid invitation token");
            response.sendError(SC_FORBIDDEN);
            return;
        }
        Email email = new Email(decoded.get().jwt().getSubject());
        User user = new User(email);
        User inviter = new User(new Email(request.getParameter("invited-by")));
        userService.create(user);
        Token authenticationToken = tokenService.generateToken(user, ONE_HOUR);
        response.setHeader("Set-Cookie", "token=" + authenticationToken.token() + "; HttpOnly; SameSite=strict; Path=/");
        response.sendRedirect("/?email=" + email.address() + "&inviter=" + inviter.email().address());
        LOG.info("User registered");
    }

    private Token extractToken(String requestUri) {
        String invitationPart = "/invitations/";
        return new Token(requestUri.substring(requestUri.indexOf(invitationPart) + invitationPart.length()));
    }
}
