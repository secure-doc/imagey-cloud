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
import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;
import static jakarta.ws.rs.core.Response.Status.ACCEPTED;
import static jakarta.ws.rs.core.Response.Status.CREATED;

import java.io.IOException;
import java.security.Principal;

import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.domain.user.UserRegistration;
import cloud.imagey.domain.user.UserRepository;
import cloud.imagey.domain.user.UserService;
import cloud.imagey.domain.user.UserService.AuthenticationStatus;
import cloud.imagey.domain.user.VerificationRequest;

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
    @PermitAll
    @Consumes(APPLICATION_JSON)
    public Response registerUser(UserRegistration registration) throws IOException {
        if (!registration.userId().id().equals(currentPrincipal.get().getName())) {
            LOG.warn("Current user is trying to register another user.");
            throw new ForbiddenException("User is only allowed to register itself.");
        }
        userService.register(registration);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed({"owner", "contact", "contact-request"})
    @Path("{userId}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public String getKey(@PathParam("userId") UserId userId, @PathParam("kid") Kid kid) throws IOException {
        User user = new User(userId, null);
        LOG.info("Loading public key");
        return userRepository.loadPublicKey(user, kid).orElseThrow(() -> new NotFoundException());
    }

    @POST
    @PermitAll
    @Path("verifications")
    @Consumes(APPLICATION_JSON)
    public Response verfiyUser(VerificationRequest request) throws IOException {
        User user = new User(request.email());

        AuthenticationStatus status = userService.startAuthenticationProcess(user);
        return status == REGISTRATION_STARTED ? Response.status(CREATED).build() : Response.status(ACCEPTED).build();
    }
}
