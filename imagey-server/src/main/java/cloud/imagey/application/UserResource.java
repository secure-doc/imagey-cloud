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

import static cloud.imagey.domain.user.UserService.AuthenticationStatus.REGISTRATION_STARTED;
import static javax.ws.rs.core.MediaType.APPLICATION_JSON;
import static javax.ws.rs.core.Response.Status.ACCEPTED;
import static javax.ws.rs.core.Response.Status.CREATED;

import java.io.IOException;
import java.security.Principal;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.inject.Provider;
import javax.ws.rs.Consumes;
import javax.ws.rs.ForbiddenException;
import javax.ws.rs.GET;
import javax.ws.rs.NotFoundException;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserRegistration;
import cloud.imagey.domain.user.UserRepository;
import cloud.imagey.domain.user.UserService;
import cloud.imagey.domain.user.UserService.AuthenticationStatus;

@Path("/")
@ApplicationScoped
public class UserResource {

    private static final Logger LOG = LogManager.getLogger(UserResource.class);

    @Inject
    private UserService userService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private Provider<Principal> currentPrincipal;

    @POST
    @Consumes(APPLICATION_JSON)
    public Response registerUser(UserRegistration registration) throws IOException {
        if (!registration.email().address().equals(currentPrincipal.get().getName())) {
            LOG.warn("Current user is trying to register another user.");
            throw new ForbiddenException("User is only allowed to register itself.");
        }
        userService.register(registration);
        return Response.ok().build();
    }

    @GET
    @Path("{email}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public String getKey(@PathParam("email") User user, @PathParam("kid") Kid kid) throws IOException {
        LOG.info("Loading public key");
        return userRepository.loadPublicKey(user, kid).orElseThrow(() -> new NotFoundException());
    }

    @POST
    @Path("{email}/verifications")
    @Consumes(APPLICATION_JSON)
    public Response verfiyUser(@PathParam("email") User user) throws IOException {

        AuthenticationStatus status = userService.startAuthenticationProcess(user);
        return status == REGISTRATION_STARTED ? Response.status(CREATED).build() : Response.status(ACCEPTED).build();
    }
}
