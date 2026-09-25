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
import java.util.Optional;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.annotation.JsonbTypeDeserializer;
import jakarta.json.bind.annotation.JsonbTypeSerializer;
import jakarta.ws.rs.BadRequestException;
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
import cloud.imagey.domain.contact.ContactStatus;
import cloud.imagey.domain.contact.EncryptedContactInfo;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.encryption.EncryptedSymmetricKey;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.encryption.PublicKey.Deserializer;
import cloud.imagey.domain.encryption.PublicKey.Serializer;
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
    @Path("{userId}/contact-requests")
    @Consumes(APPLICATION_JSON)
    public Response requestContact(@PathParam("userId") User inviter, ContactRequest request, @Context UriInfo uriInfo) throws IOException {
        Optional<User> invitee = contactService.invite(
            inviter, request.inviterEmail(), request.invitee(), request.publicKey(), request.publicProfileId(),
            request.chatId(), request.contactInfo());
        return invitee
            .map(i -> {
                UriBuilder contactRequest = uriInfo.getAbsolutePathBuilder();
                contactRequest.path(i.id().id());
                return created(contactRequest.build()).build();
            })
            .orElseGet(() -> noContent().build());
    }

    @GET
    @RolesAllowed("owner")
    @Path("{userId}/contact-requests")
    @Produces(APPLICATION_JSON)
    public List<ContactExchange> getContactRequests(@PathParam("userId") User user) {
        return contactRepository.findContactRequests(user);
    }

    @DELETE
    @RolesAllowed("owner")
    @Path("{userId}/contact-requests/{contact}")
    public void declineInvitation(@PathParam("userId") User user, @PathParam("contact") User contact) throws IOException {
        contactService.declineInvitation(user, contact);
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{userId}/contact-requests/{contact}")
    @Consumes(APPLICATION_JSON)
    public void updateContactRequest(
        @PathParam("userId") User user,
        @PathParam("contact") User contact,
        ContactRequestUpdate update) throws IOException {

        if (update.status() == ContactStatus.RECEIVED) {
            contactService.confirmReceipt(user, contact);
        } else if (update.status() == ContactStatus.ACCEPTED) {
            contactService.acceptInvitation(
                user, contact, update.publicKey(), update.sharedKey(), update.publicProfileId(), update.contactInfo());
        } else {
            // TODO move to Bean Validation
            throw new BadRequestException("Status " + update.status() + " not allowed");
        }
    }

    // inviterEmail is the caller's own address, used only to name the inviter in the invitation
    // email of a not-yet-registered invitee (see ContactService.invite); it is never stored.
    public record ContactRequest(
        Email invitee,
        Email inviterEmail,
        @JsonbTypeSerializer(Serializer.class)
        @JsonbTypeDeserializer(Deserializer.class) PublicKey publicKey,
        // The inviter's "public-profile" Document id, nullable (see docs/plans/chat-public-profile.md).
        DocumentId publicProfileId,
        // The id of the chat the inviter will own (ADR 0015), chosen by the inviter's client.
        DocumentId chatId,
        // The inviter's name and address, encrypted for the invitee (ADR 0016), nullable.
        EncryptedContactInfo contactInfo) {
    }

    // publicKey, sharedKey, publicProfileId and contactInfo are only meaningful on ACCEPTED (sent by the invitee);
    // RECEIVED carries nothing but the status (ADR 0015).
    public record ContactRequestUpdate(
        ContactStatus status,
        @JsonbTypeSerializer(Serializer.class)
        @JsonbTypeDeserializer(Deserializer.class) PublicKey publicKey,
        // The chat key wrapped by the invitee under their own "chats" document key.
        EncryptedSymmetricKey sharedKey,
        // The invitee's "public-profile" Document id, nullable.
        DocumentId publicProfileId,
        // The invitee's name and address, encrypted under the chat key (ADR 0016), nullable.
        EncryptedContactInfo contactInfo) {
    }
}
