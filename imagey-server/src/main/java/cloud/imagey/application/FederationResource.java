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
package cloud.imagey.application;

import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.Response;

import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.domain.federation.FederationSigningKey;

/**
 * Server-to-server federation (ADR 0013). Like {@link PushResource} a literal segment below {@code
 * /users}, where the JAX-RS application lives; a user id is a UUID, so it never collides with one.
 */
@ApplicationScoped
@Path("federation")
public class FederationResource {

    @Inject
    private FederationSettings settings;

    @Inject
    private FederationSigningKey signingKey;

    /**
     * The public key with which this server signs its assertions, as a key set with one key. Public
     * and without any authentication: a foreign server (and the browser of a user who types a server
     * name) has to read it before it knows anything about us. 404 while federation is off.
     */
    @GET
    @Path("key")
    @PermitAll
    @Produces("application/jwk-set+json")
    public Response key() {
        if (!settings.enabled()) {
            throw new NotFoundException();
        }
        CacheControl cacheControl = new CacheControl();
        cacheControl.setMaxAge((int) settings.keyMaxAge().toSeconds());
        return Response.ok(signingKey.publicKeySet().toString())
            .cacheControl(cacheControl)
            .header("X-Content-Type-Options", "nosniff")
            .build();
    }
}
