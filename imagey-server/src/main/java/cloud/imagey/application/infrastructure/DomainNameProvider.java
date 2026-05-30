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
package cloud.imagey.application.infrastructure;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.container.ContainerRequestContext;

import cloud.imagey.domain.user.DomainName;

@ApplicationScoped
public class DomainNameProvider {

    @Inject
    private HttpServletRequest request;

    @Produces
    public DomainName getDomainName() {
        return getDomainName(
            request.getHeader("Origin"),
            request.getHeader("Referer"),
            request.getHeader("X-Forwarded-Host"),
            request.getHeader("Host"),
            request.getHeader("X-Forwarded-Proto"),
            request.getScheme()
        );
    }

    public DomainName getDomainName(ContainerRequestContext requestContext) {
        return getDomainName(
            requestContext.getHeaderString("Origin"),
            requestContext.getHeaderString("Referer"),
            requestContext.getHeaderString("X-Forwarded-Host"),
            requestContext.getHeaderString("Host"),
            requestContext.getHeaderString("X-Forwarded-Proto"),
            requestContext.getUriInfo().getRequestUri().getScheme()
        );
    }

    public DomainName getDomainName(
        String origin, String referer, String forwardedHost, String host, String forwardedProto, String scheme) {
        if (origin != null && !origin.isBlank()) {
            return new DomainName(origin);
        }
        if (referer != null && !referer.isBlank()) {
            return new DomainName(referer);
        }
        return getHostFallback(forwardedHost, host, forwardedProto, scheme);
    }

    private DomainName getHostFallback(String forwardedHost, String host, String forwardedProto, String scheme) {
        String h = forwardedHost != null && !forwardedHost.isBlank() ? forwardedHost : host;
        if (h != null && !h.isBlank()) {
            String proto = forwardedProto != null && !forwardedProto.isBlank() ? forwardedProto : scheme;
            return new DomainName(proto + "://" + h);
        }
        return new DomainName("https://secure-doc.store");
    }
}
