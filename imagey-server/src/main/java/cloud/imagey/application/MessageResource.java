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

import javax.annotation.security.RolesAllowed;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.container.AsyncResponse;
import javax.ws.rs.container.Suspended;
import javax.ws.rs.core.Response;

import cloud.imagey.domain.chat.MessageService;
import cloud.imagey.domain.user.User;

@Path("{email}/contacts/{contact}/messages")
@ApplicationScoped
public class MessageResource {

    @Inject
    private MessageService messageService;

    @POST
    @RolesAllowed("owner")
    @Consumes(TEXT_PLAIN)
    public Response sendMessage(
        @PathParam("email") User sender,
        @PathParam("contact") User contact,
        String messageContent) throws IOException {

        messageService.sendMessage(sender, contact, messageContent);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Produces(APPLICATION_JSON)
    public void receiveMessages(
        @PathParam("email") User receiver,
        @PathParam("contact") User sender,
        @QueryParam("sinceId") String sinceId,
        @Suspended AsyncResponse asyncResponse) {

        messageService.receiveMessages(receiver, sender, sinceId, asyncResponse);
    }
}
