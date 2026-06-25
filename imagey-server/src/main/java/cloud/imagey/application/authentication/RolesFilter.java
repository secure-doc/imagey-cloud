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
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.PathSegment;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.chat.ContactRepository;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
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
    private DocumentRepository documentRepository;
    @Inject
    private HttpServletRequest request;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        Optional<Cookie> cookie = ofNullable(requestContext.getCookies().get("token"));
        Optional<DecodedToken> decodedToken = cookie.flatMap(c -> tokenService.decode(new Token(c.getValue())));
        setupPrincipal(requestContext, decodedToken);
    }

    private User extractUser(UriInfo uriInfo) {
        List<PathSegment> segments = uriInfo.getPathSegments();
        if (segments.isEmpty()) {
            return null;
        }
        return new User(new Email(segments.get(0).getPath()));
    }

    private Optional<DocumentId> extractDocumentId(UriInfo uriInfo) {
        List<PathSegment> segments = uriInfo.getPathSegments();
        if (segments.size() > 2 && segments.get(1).getPath().equals("documents")) {
            return of(new DocumentId(segments.get(2).getPath()));
        }
        return empty();
    }

    private void setupPrincipal(ContainerRequestContext requestContext, Optional<DecodedToken> decodedToken) {
        if (decodedToken.isEmpty()) {
            DefaultSecurityContext context = "anonymous"::toString;
            requestContext.setSecurityContext(context);
            Supplier<Principal> principalSupplier = requestContext.getSecurityContext()::getUserPrincipal;
            request.setAttribute(Principal.class.getName() + ".supplier", principalSupplier);
            return;
        }
        User user = extractUser(requestContext.getUriInfo());
        String principalName = decodedToken.get().jwt().getSubject();
        requestContext.setSecurityContext(forPrincipal(principalName,
            (role) -> hasRole(new User(new Email(principalName)), user, requestContext.getUriInfo(), role)));
        Supplier<Principal> principalSupplier = requestContext.getSecurityContext()::getUserPrincipal;
        request.setAttribute(Principal.class.getName() + ".supplier", principalSupplier);
    }

    private boolean hasRole(User currentPrincipal, User contextUser, UriInfo uriInfo, String role) {
        if ("owner".equals(role)) {
            return currentPrincipal.equals(contextUser);
        } else if ("contact".equals(role)) {
            return contactRepository.isContact(contextUser, currentPrincipal);
        } else if ("contact-request".equals(role)) {
            return contactRepository.getContactStatus(contextUser, currentPrincipal)
                .filter(status -> EnumSet.of(INVITATION_SENT, INVITATION_RECEIVED).contains(status))
                .isPresent();
        } else if ("recipient".equals(role)) {
            return extractDocumentId(uriInfo)
                .map(docId -> documentRepository.hasSharedKey(contextUser, docId, currentPrincipal.email()))
                .orElse(false);
        }
        return false;
    }
}
