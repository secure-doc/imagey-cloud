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

import static cloud.imagey.application.authentication.DefaultSecurityContext.forPrincipal;
import static cloud.imagey.domain.chat.ContactStatus.INVITATION_RECEIVED;
import static cloud.imagey.domain.chat.ContactStatus.INVITATION_SENT;
import static java.util.Optional.empty;
import static java.util.Optional.of;
import static java.util.Optional.ofNullable;
import static jakarta.ws.rs.Priorities.AUTHENTICATION;

import java.io.IOException;
import java.security.Principal;
import java.util.EnumSet;
import java.util.Optional;
import java.util.function.Supplier;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.chat.ContactRepository;
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
    private ContactRepository contactRepository;
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
            DefaultSecurityContext context = "anonymous"::toString;
            requestContext.setSecurityContext(context);
            return;
        }
        User user = extractUser(requestContext.getUriInfo());
        String principalName = decodedToken.get().jwt().getSubject();
        requestContext.setSecurityContext(forPrincipal(principalName,
            (role) -> getRole(new User(new Email(principalName)), user).map(role::equals).isPresent()));
        Supplier<Principal> principalSupplier = requestContext.getSecurityContext()::getUserPrincipal;
        request.setAttribute(Principal.class.getName() + ".supplier", principalSupplier);
    }

    private Optional<String> getRole(User currentPrincipal, User contextUser) {
        if (currentPrincipal.equals(contextUser)) {
            return of("owner");
        } else if (contactRepository.isContact(contextUser, currentPrincipal)) {
            return of("contact");
        } else if (contactRepository.getContactStatus(contextUser, currentPrincipal)
            .filter(status -> EnumSet.of(INVITATION_SENT, INVITATION_RECEIVED).contains(status))
            .isPresent()) {
            return of("contact-request");
        } else {
            return empty();
        }
    }
}
