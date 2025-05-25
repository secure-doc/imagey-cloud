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

import static java.util.function.Predicate.not;
import static javax.ws.rs.core.Response.Status.FORBIDDEN;
import static javax.ws.rs.core.Response.Status.UNAUTHORIZED;

import java.io.IOException;
import java.security.Principal;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerRequestFilter;
import javax.ws.rs.core.Cookie;
import javax.ws.rs.core.PathSegment;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.SecurityContext;
import javax.ws.rs.core.UriInfo;
import javax.ws.rs.ext.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;

@Provider
@ApplicationScoped
public class UserFilter implements ContainerRequestFilter {

    private static final Logger LOG = LogManager.getLogger(UserFilter.class);

    @Inject
    private TokenService tokenService;
    @Inject
    private HttpServletRequest request;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        if (isVerification(requestContext) || isAuthentication(requestContext)) {
            return;
        }
        Cookie cookie = requestContext.getCookies().get("token");
        if (cookie == null) {
            LOG.info("No authentication cookie found");
            requestContext.abortWith(Response.status(UNAUTHORIZED).build());
            return;
        }
        Optional<DecodedToken> decodedToken = tokenService.decode(new Token(cookie.getValue()));
        setupPrincipal(requestContext, decodedToken);

        if (isCreation(requestContext)) {
            return;
        }
        User user = extractUser(requestContext.getUriInfo());
        if (!tokenService.verify(decodedToken, user)) {
            LOG.info("Token not verified");
            requestContext.abortWith(Response.status(FORBIDDEN).build());
            return;
        }
    }

    private boolean isCreation(ContainerRequestContext requestContext) {
        // creation request is a POST to /users
        List<PathSegment> pathSegments = requestContext.getUriInfo().getPathSegments();
        return size(pathSegments) == 0
            && requestContext.getMethod().equalsIgnoreCase("POST");
    }

    private boolean isVerification(ContainerRequestContext requestContext) {
        // verification request is a POST to /users/{email}/verifications
        List<PathSegment> pathSegments = requestContext.getUriInfo().getPathSegments();
        return size(pathSegments) == 2
            && "verifications".equals(pathSegments.get(1).getPath())
            && requestContext.getMethod().equalsIgnoreCase("POST");
    }

    private boolean isAuthentication(ContainerRequestContext requestContext) {
        // authentication request is a POST to /users/{email}/authentications
        List<PathSegment> pathSegments = requestContext.getUriInfo().getPathSegments();
        return size(pathSegments) == 2
            && "authentications".equals(pathSegments.get(1).getPath())
            && requestContext.getMethod().equalsIgnoreCase("POST");
    }

    private User extractUser(UriInfo uriInfo) {
        return new User(new Email(uriInfo.getPathSegments().get(0).getPath()));
    }

    private long size(List<PathSegment> pathSegments) {
        return pathSegments.stream().map(PathSegment::getPath).filter(not(String::isEmpty)).count();
    }

    private void setupPrincipal(ContainerRequestContext requestContext, Optional<DecodedToken> decodedToken) {
        if (decodedToken.isEmpty()) {
            return;
        }
        requestContext.setSecurityContext(new SecurityContext() {

            @Override
            public Principal getUserPrincipal() {
                return decodedToken.get().jwt()::getSubject;
            }

            @Override
            public boolean isUserInRole(String role) {
                return false;
            }

            @Override
            public boolean isSecure() {
                return true;
            }

            @Override
            public String getAuthenticationScheme() {
                return DIGEST_AUTH;
            }
        });
        Supplier<Principal> principalSupplier = requestContext.getSecurityContext()::getUserPrincipal;
        request.setAttribute(Principal.class.getName() + ".supplier", principalSupplier);
    }
}
