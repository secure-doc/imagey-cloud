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
import static jakarta.ws.rs.core.MediaType.MULTIPART_FORM_DATA;
import static jakarta.ws.rs.core.Response.created;
import static jakarta.ws.rs.core.Response.Status.ACCEPTED;
import static jakarta.ws.rs.core.Response.Status.CREATED;

import java.io.IOException;
import java.net.URI;
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
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import org.apache.cxf.jaxrs.ext.multipart.Multipart;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.Document;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedPrivateKey;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.DeviceId;
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
    @PermitAll
    @Consumes(MULTIPART_FORM_DATA)
    public Response registerUser(
        @Context UriInfo uriInfo,
        @Multipart("email") String email,
        @Multipart("deviceId") String deviceId,
        @Multipart("publicDeviceKey") String deviceKey,
        @Multipart("publicMainKey") String publicMainKey,
        @Multipart("privateMainKey") EncryptedPrivateKey privateMainKey,
        @Multipart("settingsKey") EncryptedSharedKey settingsKey,
        @Multipart("settings") EncryptedContent settings,
        @Multipart("documentListId") String documentListId,
        @Multipart("documentListKey") EncryptedSharedKey documentListKey,
        @Multipart("documentList") EncryptedContent documentList,
        @Multipart("chatListId") String chatListId,
        @Multipart("chatListKey") EncryptedSharedKey chatListKey,
        @Multipart("chatList") EncryptedContent chatList,
        @Multipart("profileId") String profileId,
        @Multipart("profileKey") EncryptedSharedKey profileKey,
        @Multipart("profile") EncryptedContent profile) throws IOException {

        if (!email.equals(currentPrincipal.get().getName())) {
            throw new ForbiddenException();
        }
        UserRegistration registration = new UserRegistration(
            new Email(email),
            new DeviceId(deviceId),
            new PublicKey(deviceKey),
            new PublicKey(publicMainKey),
            privateMainKey);
        userService.register(
            registration,
            new Document(new DocumentId(email), settingsKey, settings),
            new Document(new DocumentId(documentListId), documentListKey, documentList),
            new Document(new DocumentId(chatListId), chatListKey, chatList),
            new Document(new DocumentId(profileId), profileKey, profile));
        URI location = uriInfo.getAbsolutePathBuilder().path(email).build();
        return created(location).build();
    }

    @GET
    @RolesAllowed("owner")
    @Path("{email}/public-keys/{kid}")
    @Produces(APPLICATION_JSON)
    public String getKey(@PathParam("email") User user, @PathParam("kid") Kid kid) throws IOException {
        LOG.info("Loading public key");
        return userRepository.loadPublicKey(user, kid).orElseThrow(() -> new NotFoundException());
    }

    @POST
    @PermitAll
    @Path("{email}/verifications")
    @Consumes(APPLICATION_JSON)
    public Response verfiyUser(@PathParam("email") User user) throws IOException {

        AuthenticationStatus status = userService.startAuthenticationProcess(user);
        return status == REGISTRATION_STARTED ? Response.status(CREATED).build() : Response.status(ACCEPTED).build();
    }
}
