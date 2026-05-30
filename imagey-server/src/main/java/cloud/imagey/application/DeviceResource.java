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

import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;

import java.io.IOException;
import java.util.List;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.encryption.PrivateKeyMetadata;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.DeviceRepository;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Path("{email}/devices")
public class DeviceResource {

    private static final Logger LOG = LogManager.getLogger(DeviceResource.class);

    @Inject
    private DeviceRepository deviceRepository;

    @GET
    @RolesAllowed("owner")
    @Produces(APPLICATION_JSON)
    public List<DeviceId> getDevices(@PathParam("email") User user) {
        return deviceRepository.loadDevices(user);
    }

    @POST
    @RolesAllowed("owner")
    @Path("{deviceId}/public-keys")
    @Consumes(APPLICATION_JSON)
    public Response storeDevicePublicKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        String key) throws IOException {

        deviceRepository.storeDevicePublicKey(user, deviceId, new PublicKey(key));
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Path("{deviceId}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public String getDevicePublicKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @PathParam("kid") Kid kid) throws IOException {

        LOG.info("Loading public device key");
        return deviceRepository.loadDevicePublicKey(user, deviceId, kid).orElseThrow(NotFoundException::new);
    }

    @POST
    @RolesAllowed("owner")
    @Path("{deviceId}/private-keys")
    @Consumes(APPLICATION_JSON)
    public Response storeEncryptedPrivateKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        String key) throws IOException {

        deviceRepository.storeEncryptedPrivateKey(
            user,
            deviceId,
            key);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Path("{deviceId}/private-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public PrivateKeyMetadata getEncryptedPrivateKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @PathParam("kid") Kid kid) throws IOException {

        return deviceRepository.loadPrivateKey(user, deviceId, kid).orElseThrow(() -> new NotFoundException());
    }
}
