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

import java.io.IOException;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.user.DomainName;

@ApplicationScoped
@jakarta.ws.rs.ext.Provider
public class CorsFilter implements ContainerResponseFilter {

    @Inject
    private Provider<DomainName> currentDomain;

    @Inject
    @ConfigProperty(name = "secure-doc.urls")
    private List<DomainName> allowedUrls;

    @Override
    public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext) throws IOException {

        DomainName domain = currentDomain.get();
        if (!allowedUrls.contains(domain)) {
            return;
        }
        responseContext.getHeaders().add("Access-Control-Allow-Origin", domain.value());

        responseContext.getHeaders().add("Access-Control-Allow-Credentials", "true");
        responseContext.getHeaders().add("Access-Control-Allow-Headers", "origin, content-type, accept, authorization");
        responseContext.getHeaders().add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    }
}