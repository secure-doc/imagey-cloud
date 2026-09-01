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
import static jakarta.ws.rs.Priorities.AUTHENTICATION;
import static java.util.Optional.ofNullable;

import java.io.IOException;
import java.security.Principal;
import java.util.Iterator;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.Stream;

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

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.token.TokenService.TokenType;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.infrastructure.common.BoundedLruCache;

@Provider
@ApplicationScoped
@Priority(AUTHENTICATION)
public class RolesFilter implements ContainerRequestFilter {

    private static final int MEMBERSHIP_CACHE_SIZE = 10_000;

    // Positive member decisions per (owner, document, caller). Negatives are never cached - a
    // well-behaved client only asks for documents it can see, so denials are rare, and not caching
    // them means a newly granted key is picked up on the next request. No invalidation is needed:
    // key slots are write-once (see DocumentRepository.persist), so a key add can only *grant* a
    // path, never take one away. A future key/document deletion would break that and need the
    // cache cleared.
    private final BoundedLruCache<User, DocumentId, User, Boolean> membershipCache =
        new BoundedLruCache<>(MEMBERSHIP_CACHE_SIZE);

    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;
    @Inject
    private HttpServletRequest request;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        Optional<Cookie> cookie = ofNullable(requestContext.getCookies().get("token"));
        Optional<DecodedToken> decodedToken = cookie
            .flatMap(c -> tokenService.decode(new Token(c.getValue())))
            .filter(token -> token.isOfType(TokenType.AUTHENTICATION));
        setupPrincipal(requestContext, decodedToken);
    }

    private User extractUser(UriInfo uriInfo) {
        return uriInfo.getPathSegments()
            .stream()
            .findFirst()
            .map(PathSegment::getPath)
            .map(UserId::new)
            .map(User::new)
            .orElse(null);
    }

    private Optional<DocumentId> extractDocumentId(UriInfo uriInfo) {
        Stream<PathSegment> documentPath = uriInfo.getPathSegments().stream().skip(1);
        return ofNullable(documentPath.iterator())
            .filter(Iterator::hasNext)
            .filter(i -> i.next().getPath().equals("documents"))
            .filter(Iterator::hasNext)
            .map(Iterator::next)
            .map(PathSegment::getPath)
            .map(DocumentId::new);
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
            (role) -> hasRole(new User(new UserId(principalName)), user, requestContext.getUriInfo(), role)));
        Supplier<Principal> principalSupplier = requestContext.getSecurityContext()::getUserPrincipal;
        request.setAttribute(Principal.class.getName() + ".supplier", principalSupplier);
    }

    private boolean hasRole(User currentPrincipal, User contextUser, UriInfo uriInfo, String role) {
        if ("owner".equals(role)) {
            return currentPrincipal.equals(contextUser);
        }
        if (!"member".equals(role)) {
            // Only "owner"/"member" are used across the resources (see @RolesAllowed). Deny anything
            // else explicitly rather than let it fall through to the key-chain check - a future
            // @RolesAllowed("admin") or a typo must not be evaluated as a member probe.
            return false;
        }
        return contextUser != null && extractDocumentId(uriInfo)
            .map(documentId -> isMember(contextUser, documentId, currentPrincipal))
            .orElse(false);
    }

    private boolean isMember(User owner, DocumentId documentId, User member) {
        Boolean cached = membershipCache.get(owner, documentId, member);
        if (cached != null) {
            return cached;
        }
        boolean result = documentRepository.isIssuerInKeyChain(owner, documentId, member);
        if (result) {
            membershipCache.put(owner, documentId, member, true);
        }
        return result;
    }
}
