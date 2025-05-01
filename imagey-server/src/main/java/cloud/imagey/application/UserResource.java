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
import static javax.ws.rs.core.Response.accepted;
import static javax.ws.rs.core.Response.status;
import static javax.ws.rs.core.Response.Status.CONFLICT;

import java.io.IOException;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.NotFoundException;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.Response;

import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserRepository;
import cloud.imagey.domain.user.UserService;

@Path("/")
@ApplicationScoped
public class UserResource {

    @Inject
    private UserService userService;
    @Inject
    private UserRepository userRepository;

    @POST
    @Consumes(APPLICATION_JSON)
    public Response createUser(User user) {
        if (userService.startAuthenticationProcess(user) == REGISTRATION_STARTED) {
            return accepted().build();
        } else {
            return status(CONFLICT).build();
        }
    }

    @GET
    @Path("{email}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public String getKey(@PathParam("email") User user, @PathParam("kid") Kid kid) throws IOException {
        return userRepository.loadPublicKey(user, kid).orElseThrow(() -> new NotFoundException());
    }

    @PUT
    @Path("{email}/public-keys/{kid}")
    @Consumes(APPLICATION_JSON)
    public Response storePublicKey(@PathParam("email") User user, @PathParam("kid") Kid kid, String key) throws IOException {
        userRepository.storePublicKey(user, kid, key);
        return Response.ok().build();
    }

    @PUT
    @Path("{email}/devices/{deviceId}/keys/{kid}")
    @Consumes(APPLICATION_JSON)
    public Response storePublicKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @PathParam("kid") Kid kid,
        String key) throws IOException {

        userRepository.storeDeviceKey(user, deviceId, kid, key);
        return Response.ok().build();
    }
}
