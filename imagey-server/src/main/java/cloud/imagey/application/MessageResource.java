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
import static jakarta.ws.rs.core.MediaType.TEXT_PLAIN;
import static java.util.Collections.emptyList;
import static java.util.concurrent.TimeUnit.SECONDS;
import static java.util.function.Predicate.not;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.container.AsyncResponse;
import jakarta.ws.rs.container.Suspended;
import jakarta.ws.rs.core.Response;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.chat.Channel;
import cloud.imagey.domain.chat.Message;
import cloud.imagey.domain.chat.MessageContent;
import cloud.imagey.domain.chat.MessageId;
import cloud.imagey.domain.chat.MessageRepository;
import cloud.imagey.domain.chat.MessageService;
import cloud.imagey.domain.user.User;

@Path("{email}/contacts/{contact}/messages")
@ApplicationScoped
public class MessageResource {

    @Inject
    private MessageService messageService;
    @Inject
    private MessageRepository messageRepository;
    @Inject
    @ConfigProperty(name = "chat.polling.timeout", defaultValue = "30")
    private long pollingTimeoutSeconds;
    private Map<Channel, Queue<AsyncResponse>> waitingRequests = new ConcurrentHashMap<>();

    @POST
    @RolesAllowed("owner")
    @Consumes(TEXT_PLAIN)
    public Response sendMessage(
        @PathParam("email") User sender,
        @PathParam("contact") User contact,
        MessageContent messageContent) throws IOException {

        messageService.sendMessage(sender, contact, messageContent);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed("owner")
    @Produces(APPLICATION_JSON)
    public void receiveMessages(
        @PathParam("email") User receiver,
        @PathParam("contact") User sender,
        @QueryParam("sinceId") MessageId sinceId,
        @Suspended AsyncResponse asyncResponse) {

        asyncResponse.setTimeout(pollingTimeoutSeconds, SECONDS);
        asyncResponse.setTimeoutHandler(ar -> ar.resume(Response.ok(emptyList()).build()));

        List<Message> messages = messageRepository.fetchMessages(receiver, sender, Optional.ofNullable(sinceId));
        if (messages.isEmpty()) {
            Channel channel = new Channel(sender.email().address() + ":" + receiver.email().address());
            waitingRequests.computeIfAbsent(channel, q -> new ConcurrentLinkedQueue<>()).add(asyncResponse);
        }
        asyncResponse.resume(messages);
    }

    public void sendMessage(@Observes Message message) {
        Queue<AsyncResponse> responses = waitingRequests.remove(message.channel());
        if (responses != null) {
            List<Message> messages = List.of(message);
            responses.stream().filter(not(AsyncResponse::isDone)).forEach(response -> response.resume(messages));
        }
    }
}
