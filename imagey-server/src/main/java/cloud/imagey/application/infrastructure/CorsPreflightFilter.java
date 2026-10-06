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

import static jakarta.ws.rs.Priorities.AUTHENTICATION;
import static jakarta.ws.rs.core.Response.Status.NO_CONTENT;

import java.io.IOException;
import java.util.List;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.PreMatching;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.application.authentication.GuestPolicy;
import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.domain.user.DomainName;

/**
 * Answers the CORS preflight of a foreign origin (ADR 0013 A4) for the guest routes. A preflight
 * never carries the {@code Authorization} header, so it must be answered before the authentication
 * and the role checks; {@link CorsFilter} adds the headers to the empty response.
 */
@Provider
@PreMatching
@ApplicationScoped
@Priority(AUTHENTICATION - 1)
public class CorsPreflightFilter implements ContainerRequestFilter {

    @Inject
    private DomainNameProvider domainNameProvider;

    @Inject
    @ConfigProperty(name = "secure-doc.urls")
    private List<DomainName> allowedUrls;

    @Inject
    private FederationSettings federationSettings;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        String requestedMethod = requestContext.getHeaderString("Access-Control-Request-Method");
        if (!federationSettings.enabled()
            || !"OPTIONS".equals(requestContext.getMethod())
            || requestContext.getHeaderString("Origin") == null
            || requestedMethod == null
            || allowedUrls.contains(domainNameProvider.getDomainName(requestContext))) {
            return;
        }
        if (GuestPolicy.isGuestRoute(requestedMethod, CorsFilter.pathSegments(requestContext))) {
            requestContext.abortWith(Response.status(NO_CONTENT).build());
        }
    }
}
