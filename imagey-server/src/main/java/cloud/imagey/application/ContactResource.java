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
import static jakarta.ws.rs.core.Response.created;
import static jakarta.ws.rs.core.Response.noContent;

import java.io.IOException;
import java.util.List;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.chat.ContactKeys;
import cloud.imagey.domain.chat.ContactRepository;
import cloud.imagey.domain.chat.ContactService;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.user.User;

@Path("/")
@ApplicationScoped
public class ContactResource {

    private static final Logger LOG = LogManager.getLogger(ContactResource.class);

    @Inject
    private ContactService contactService;
    @Inject
    private ContactRepository contactRepository;

    @POST
    @RolesAllowed("owner")
    @Path("{email}/contact-requests")
    @Consumes(APPLICATION_JSON)
    public Response requestContact(@PathParam("email") User sender, User recipient, @Context UriInfo uriInfo) throws IOException {
        boolean created = contactService.invite(sender, recipient);
        if (created) {
            UriBuilder contactRequest = uriInfo.getAbsolutePathBuilder();
            contactRequest.path(recipient.email().address());
            return created(contactRequest.build()).build();
        } else {
            return noContent().build();
        }
    }

    @GET
    @RolesAllowed("owner")
    @Path("{email}/contact-requests")
    public List<User> getContactRequests(@PathParam("email") User user) {
        return contactRepository.findContactRequests(user);
    }

    @DELETE
    @RolesAllowed("owner")
    @Path("{email}/contact-requests/{contact}")
    public void declineInvitation(@PathParam("email") User user, @PathParam("contact") User contact) throws IOException {
        contactService.declineInvitation(user, contact);
    }

    @GET
    @RolesAllowed("owner")
    @Path("{email}/contacts")
    @Produces(APPLICATION_JSON)
    public List<User> getContacts(@PathParam("email") User user) {
        return contactRepository.findContacts(user);
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{email}/contacts/{contact}")
    @Consumes(APPLICATION_JSON)
    public void acceptInvitation(@PathParam("email") User user, @PathParam("contact") User contact, ContactKeys keys)
            throws IOException {

        contactService.acceptInvitation(user, contact, keys);
    }

    @GET
    @RolesAllowed("owner")
    @Path("{email}/contacts/{contact}/key")
    @Produces(APPLICATION_JSON)
    public EncryptedSharedKey getContactKey(@PathParam("email") User user, @PathParam("contact") User contact) {
        return contactRepository.getContactKey(user, contact).orElseThrow(NotFoundException::new);
    }



    @PUT
    @RolesAllowed("owner")
    @Path("{email}/contacts/{contact}/key")
    @Consumes(APPLICATION_JSON)
    public void reissueContactKey(
        @PathParam("email") User user,
        @PathParam("contact") User contact,
        ContactKeys keys) throws IOException {

        contactService.reissueKey(user, contact, keys);
    }
}
