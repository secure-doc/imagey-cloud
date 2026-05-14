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
import static javax.ws.rs.Priorities.AUTHENTICATION;

import java.io.IOException;
import java.security.Principal;
import java.util.Optional;
import java.util.function.Supplier;

import javax.annotation.Priority;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerRequestFilter;
import javax.ws.rs.core.Cookie;
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
@Priority(AUTHENTICATION)
public class RolesFilter implements ContainerRequestFilter {

    private static final Logger LOG = LogManager.getLogger(RolesFilter.class);

    @Inject
    private TokenService tokenService;
    @Inject
    private HttpServletRequest request;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        Optional<Cookie> cookie = ofNullable(requestContext.getCookies().get("token"));
        Optional<DecodedToken> decodedToken = cookie.flatMap(c -> tokenService.decode(new Token(c.getValue())));
        setupPrincipal(requestContext, decodedToken);
    }

    private User extractUser(UriInfo uriInfo) {
        return new User(new Email(uriInfo.getPathSegments().get(0).getPath()));
    }

    private void setupPrincipal(ContainerRequestContext requestContext, Optional<DecodedToken> decodedToken) {
        if (decodedToken.isEmpty()) {
            requestContext.setSecurityContext(new SecurityContext() {

                @Override
                public Principal getUserPrincipal() {
                    return () -> "anonymous";
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
            return;
        }
        User user = extractUser(requestContext.getUriInfo());
        requestContext.setSecurityContext(new SecurityContext() {

            @Override
            public Principal getUserPrincipal() {
                return decodedToken.get().jwt()::getSubject;
            }

            @Override
            public boolean isUserInRole(String role) {
                return user.email().address().equals(getUserPrincipal().getName()) && "owner".equals(role);
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
