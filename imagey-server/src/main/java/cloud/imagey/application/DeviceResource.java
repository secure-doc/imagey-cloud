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
import java.io.StringReader;
import java.util.List;
import java.util.Optional;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonException;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.application.authentication.SessionDevice;
import cloud.imagey.domain.encryption.PrivateKeyMetadata;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.Device;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.DeviceRepository;
import cloud.imagey.domain.user.EncryptedDeviceInfo;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Path("{userId}/devices")
public class DeviceResource {

    private static final Logger LOG = LogManager.getLogger(DeviceResource.class);

    @Inject
    private DeviceRepository deviceRepository;
    @Inject
    private HttpServletRequest request;

    @GET
    @RolesAllowed("owner")
    @Produces(APPLICATION_JSON)
    public List<Device> getDevices(@PathParam("userId") User user) {
        return deviceRepository.loadDevices(user);
    }

    // The info is opaque ciphertext to us (ADR 0017), sent as a JSON string. A device's info can
    // only be stored once the device is registered, otherwise any id would show up as a device.
    // Who may write it is decided by ADR 0018: a session bound to an activated device, or - the
    // one write of a freshly registered device, made on the email session - the first info of a
    // device that is neither activated nor described yet.
    @PUT
    @RolesAllowed("owner")
    @Path("{deviceId}/info")
    @Consumes(APPLICATION_JSON)
    public Response storeDeviceInfo(
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId,
        String info) {

        if (!deviceRepository.isRegistered(user, deviceId)) {
            throw new NotFoundException();
        }
        EncryptedDeviceInfo parsed = parseDeviceInfo(info);
        boolean boundToActivatedDevice = sessionDevice()
            .filter(device -> deviceRepository.isActivated(user, device))
            .isPresent();
        boolean firstInfoOfPendingDevice = !deviceRepository.isActivated(user, deviceId)
            && deviceRepository.loadDeviceInfo(user, deviceId).isEmpty();
        if (!boundToActivatedDevice && !firstInfoOfPendingDevice) {
            throw new ForbiddenException("The session is not bound to an activated device.");
        }
        deviceRepository.storeDeviceInfo(user, deviceId, parsed);
        return Response.ok().build();
    }

    private Optional<DeviceId> sessionDevice() {
        return SessionDevice.of(request);
    }

    private static EncryptedDeviceInfo parseDeviceInfo(String json) {
        try (JsonReader reader = Json.createReader(new StringReader(json))) {
            if (reader.readValue() instanceof JsonString info) {
                return new EncryptedDeviceInfo(info.getString());
            }
        } catch (JsonException | IllegalArgumentException e) {
            LOG.debug("Invalid device info", e);
        }
        throw new BadRequestException("Device info must be a base64 JSON string");
    }

    @POST
    @RolesAllowed("owner")
    @Path("{deviceId}/public-keys")
    @Consumes(APPLICATION_JSON)
    public Response storeDevicePublicKey(
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId,
        String key) throws IOException {

        deviceRepository.storeDevicePublicKey(user, deviceId, new PublicKey(key));
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Path("{deviceId}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public PublicKey getDevicePublicKey(
        @PathParam("userId") User user,
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
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId,
        PrivateKeyMetadata key) throws IOException {

        if (!deviceRepository.isRegistered(user, deviceId)) {
            throw new NotFoundException();
        }
        // Only an activated device may hand the main key to another one, and only in its own name.
        boolean boundToEncryptingDevice = sessionDevice()
            .filter(device -> device.equals(key.encryptingDeviceId()))
            .filter(device -> deviceRepository.isActivated(user, device))
            .isPresent();
        if (!boundToEncryptingDevice) {
            throw new ForbiddenException("The session is not bound to the activated encrypting device.");
        }
        deviceRepository.storeEncryptedPrivateKey(user, deviceId, key);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Path("{deviceId}/private-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public PrivateKeyMetadata getEncryptedPrivateKey(
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @PathParam("kid") Kid kid) throws IOException {

        return deviceRepository.loadPrivateKey(user, deviceId, kid).orElseThrow(() -> new NotFoundException());
    }

    @POST
    @RolesAllowed("owner")
    @Path("{deviceId}/recovery-key")
    @Consumes(APPLICATION_JSON)
    public Response storeDeviceRecoveryKey(
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId,
        String recoveryKey) throws IOException {

        // The recovery key only matters to the device it belongs to.
        if (sessionDevice().filter(deviceId::equals).isEmpty()) {
            throw new ForbiddenException("The session is not bound to this device.");
        }
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, recoveryKey);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Path("{deviceId}/recovery-key")
    @Produces(APPLICATION_JSON)
    public String getDeviceRecoveryKey(
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId) throws IOException {

        LOG.info("Loading device recovery key");
        return deviceRepository.loadDeviceRecoveryKey(user, deviceId).orElseThrow(NotFoundException::new);
    }
}
