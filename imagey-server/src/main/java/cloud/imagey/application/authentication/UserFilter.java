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

import static javax.ws.rs.core.Response.Status.FORBIDDEN;
import static javax.ws.rs.core.Response.Status.UNAUTHORIZED;

import java.io.IOException;
import java.util.List;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerRequestFilter;
import javax.ws.rs.core.Cookie;
import javax.ws.rs.core.PathSegment;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.UriInfo;
import javax.ws.rs.ext.Provider;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;

@Provider
@ApplicationScoped
public class UserFilter implements ContainerRequestFilter {

    @Inject
    private TokenService tokenService;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        if (isEmpty(requestContext.getUriInfo().getPathSegments())
            && requestContext.getMethod().equalsIgnoreCase("POST")) {
            return; // POST /users/ is allowed for anyone
        }
        Cookie cookie = requestContext.getCookies().get("token");
        if (cookie == null) {
            requestContext.abortWith(Response.status(UNAUTHORIZED).build());
        }
        Token token = new Token(cookie.getValue());

        User user = extractUser(requestContext.getUriInfo());
        if (!tokenService.verify(token, user)) {
            requestContext.abortWith(Response.status(FORBIDDEN).build());
        }
    }

    private User extractUser(UriInfo uriInfo) {
        return new User(new Email(uriInfo.getPathSegments().get(0).getPath()));
    }

    private boolean isEmpty(List<PathSegment> pathSegments) {
        return pathSegments.isEmpty()
            || (pathSegments.size() == 1 && pathSegments.get(0).getPath().isEmpty());
    }
}
