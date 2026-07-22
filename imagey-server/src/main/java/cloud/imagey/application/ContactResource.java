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

import cloud.imagey.domain.contact.ContactExchange;
import cloud.imagey.domain.contact.ContactRepository;
import cloud.imagey.domain.contact.ContactService;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.mail.Email;
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
    public Response requestContact(@PathParam("email") User inviter, ContactRequest request, @Context UriInfo uriInfo) throws IOException {
        boolean created = contactService.invite(inviter, new Email(request.recipient()), request.key());
        if (created) {
            UriBuilder contactRequest = uriInfo.getAbsolutePathBuilder();
            contactRequest.path(request.recipient());
            return created(contactRequest.build()).build();
        } else {
            return noContent().build();
        }
    }

    @GET
    @RolesAllowed("owner")
    @Path("{email}/contact-requests")
    @Produces(APPLICATION_JSON)
    public List<ContactExchange> getContactRequests(@PathParam("email") User user) {
        return contactRepository.findContactRequests(user);
    }

    @DELETE
    @RolesAllowed("owner")
    @Path("{email}/contact-requests/{contact}")
    public void declineInvitation(@PathParam("email") User user, @PathParam("contact") User contact) throws IOException {
        contactService.declineInvitation(user, contact);
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{email}/contacts/{contact}")
    @Consumes(APPLICATION_JSON)
    public void acceptInvitation(@PathParam("email") User user, @PathParam("contact") User contactUser, Contact contactObj)
            throws IOException {
        contactService.acceptInvitation(user, contactUser, contactObj.documentId(), contactObj.key());
    }

    public record ContactRequest(String recipient, PublicKey key) {
    }

    public record Contact(String documentId, String key) {
    }
}
