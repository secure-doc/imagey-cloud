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

import static javax.ws.rs.core.MediaType.APPLICATION_JSON;
import static javax.ws.rs.core.MediaType.TEXT_PLAIN;

import java.io.IOException;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.NotFoundException;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

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

    @POST
    @Path("{deviceId}/public-keys")
    @Consumes(APPLICATION_JSON)
    public Response storeDevicePublicKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        PublicKey key) throws IOException {

        deviceRepository.storeDevicePublicKey(user, deviceId, key);
        return Response.ok().build();
    }

    @GET
    @Path("{deviceId}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public String getDevicePublicKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @PathParam("kid") Kid kid) throws IOException {

        LOG.info("Loading public device key");
        return deviceRepository.loadDevicePublicKey(user, deviceId, kid).orElseThrow(() -> new NotFoundException());
    }

    @GET
    @Path("{deviceId}/private-keys/{kid}")
    @Produces(TEXT_PLAIN)
    public String getEncryptedPrivateKey(
        @PathParam("email") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @PathParam("kid") Kid kid) throws IOException {

        return deviceRepository.loadPrivateKey(user, deviceId, kid).orElseThrow(() -> new NotFoundException());
    }
}
