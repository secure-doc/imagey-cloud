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

import static cloud.imagey.domain.chat.ContactStatus.DECLINED_BY_USER;
import static javax.ws.rs.core.MediaType.APPLICATION_JSON;

import java.io.IOException;
import java.util.List;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.chat.ContactRepository;
import cloud.imagey.domain.chat.ContactService;
import cloud.imagey.domain.chat.ContactStatusUpdate;
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
    @Path("{email}/contact-requests")
    @Consumes(APPLICATION_JSON)
    public void requestContact(@PathParam("email") User sender, User recipient) throws IOException {
        contactService.invite(sender, recipient);
    }

    @GET
    @Path("{email}/contact-requests")
    public List<User> getContactRequests(@PathParam("email") User user) {
        return contactRepository.findContactRequests(user);
    }

    @PUT
    @Path("{email}/contact-requests/{contact}")
    @Consumes(APPLICATION_JSON)
    public void declineInvitation(@PathParam("email") User user, @PathParam("contact") User contact, ContactStatusUpdate statusUpdate)
            throws IOException {

        if (statusUpdate.status() == DECLINED_BY_USER) {
            contactService.rejectInvitation(user, contact);
        }
    }

    @GET
    @Path("{email}/contacts")
    @Produces(APPLICATION_JSON)
    public List<User> getContacts(@PathParam("email") User user) {
        return contactRepository.findContacts(user);
    }

    @PUT
    @Path("{email}/contacts/{contact}")
    @Consumes(APPLICATION_JSON)
    public void acceptInvitation(@PathParam("email") User user, @PathParam("contact") User contact, EncryptedSharedKey key)
            throws IOException {

        contactService.acceptInvitation(user, contact, key);
    }
}
