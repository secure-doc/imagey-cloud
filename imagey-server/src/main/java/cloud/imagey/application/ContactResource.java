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
import static javax.ws.rs.core.Response.created;
import static javax.ws.rs.core.Response.noContent;

import java.io.IOException;
import java.util.List;

import javax.annotation.security.RolesAllowed;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.DELETE;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.UriBuilder;
import javax.ws.rs.core.UriInfo;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

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
    @Consumes(APPLICATION_JSON)
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
    public void acceptInvitation(@PathParam("email") User user, @PathParam("contact") User contact, EncryptedSharedKey key)
            throws IOException {

        contactService.acceptInvitation(user, contact, key);
    }
}
