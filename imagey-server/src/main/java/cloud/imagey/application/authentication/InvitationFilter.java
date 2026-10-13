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
import static jakarta.servlet.http.HttpServletResponse.SC_BAD_REQUEST;
import static jakarta.servlet.http.HttpServletResponse.SC_FORBIDDEN;
import static jakarta.servlet.http.HttpServletResponse.SC_METHOD_NOT_ALLOWED;
import static jakarta.servlet.http.HttpServletResponse.SC_NOT_FOUND;
import static jakarta.servlet.http.HttpServletResponse.SC_SEE_OTHER;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
import cloud.imagey.domain.token.TokenService.TokenType;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.domain.user.UserMappingService;
import cloud.imagey.domain.user.UserService;

@ApplicationScoped
@WebFilter(urlPatterns = "/invitations/*")
public class InvitationFilter extends HttpFilter {

    private static final Logger LOG = LogManager.getLogger(InvitationFilter.class);
    @Inject
    private TokenService tokenService;
    @Inject
    private UserService userService;
    @Inject
    private UserMappingService userMappingService;

    @Override
    public void doFilter(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        String[] segments = segmentsAfterPrefix(request.getRequestURI());
        boolean registration = segments.length == 2 && "registration".equals(segments[1]);
        if (!isKnownRoute(request, response, segments.length, registration)) {
            return;
        }
        Token invitationToken = new Token(segments[0]);
        Optional<DecodedToken> decoded = tokenService.decode(invitationToken);
        String invitedBy = request.getParameter("invited-by");
        if (decoded.isEmpty() || !decoded.get().isOfType(TokenType.INVITATION)) {
            LOG.warn("Invalid invitation token");
            response.sendError(SC_FORBIDDEN);
        } else if (invitedBy == null || invitedBy.isBlank()) {
            response.sendError(SC_BAD_REQUEST);
        } else if (registration) {
            register(response, new Email(decoded.get().jwt().getSubject()), new UserId(invitedBy));
        } else {
            // Opening the link (also by a mail client's link scanner) creates no account: the invitee
            // chooses first where to register. The token travels in the fragment, so it neither reaches
            // an access log nor a Referer header of the SPA route.
            response.sendRedirect("/join#token=" + encode(invitationToken.token()) + "&invited-by=" + encode(invitedBy));
        }
    }

    // GET /invitations/{token} and POST /invitations/{token}/registration; anything else is answered here.
    private boolean isKnownRoute(HttpServletRequest request, HttpServletResponse response, int segments, boolean registration)
            throws IOException {
        if (segments != 1 && !registration) {
            response.sendError(SC_NOT_FOUND);
            return false;
        }
        String allowed = registration ? "POST" : "GET";
        if (!allowed.equals(request.getMethod())) {
            response.setHeader("Allow", allowed);
            response.sendError(SC_METHOD_NOT_ALLOWED);
            return false;
        }
        return true;
    }

    private void register(HttpServletResponse response, Email email, UserId inviter) throws IOException {
        LOG.info("Registration via invitation started");
        UserId userId = userMappingService.registerUser(email);
        User user = new User(userId);
        userService.create(user);
        Token authenticationToken = tokenService.generateAuthenticationToken(user, ONE_HOUR);
        response.setHeader("Set-Cookie", tokenService.sessionAuthenticationCookie(authenticationToken));
        // 303: the browser follows a form POST with a GET.
        response.setStatus(SC_SEE_OTHER);
        response.setHeader("Location", buildRedirect(email, userId, inviter));
        LOG.info("User registered");
    }

    // The SPA finishes registration and then accepts the contact request, reading the inviter's
    // public main key off the invitee's own contact-request entry
    // (GET /users/{invitee}/contact-requests) - it does not travel in this URL.
    private String buildRedirect(Email email, UserId userId, UserId inviter) {
        return "/?email=" + encode(email.address()) + "&userId=" + encode(userId.id()) + "&inviter=" + encode(inviter.id());
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    // "/invitations/{token}" -> [token], "/invitations/{token}/registration" -> [token, "registration"].
    private String[] segmentsAfterPrefix(String requestUri) {
        String invitationPart = "/invitations/";
        return requestUri.substring(requestUri.indexOf(invitationPart) + invitationPart.length()).split("/", -1);
    }
}
