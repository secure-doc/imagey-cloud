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

import static jakarta.ws.rs.core.MediaType.TEXT_PLAIN;

import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;

import cloud.imagey.infrastructure.push.VapidKeys;

/**
 * A literal path segment next to {@code /users/verifications} (see {@code
 * cloud.imagey.application.authentication}) - the JAX-RS application lives under {@code /users}, so
 * this cannot be its own top-level path.
 */
@ApplicationScoped
@Path("push")
public class PushResource {

    @Inject
    private VapidKeys vapidKeys;

    /** 404 when push is disabled (no VAPID keys configured) - the client then never offers to enable it. */
    @GET
    @Path("vapid-public-key")
    @PermitAll
    @Produces(TEXT_PLAIN)
    public String vapidPublicKey() {
        if (!vapidKeys.isEnabled()) {
            throw new NotFoundException();
        }
        return vapidKeys.publicKeyBase64Url();
    }
}
