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
import static java.lang.Math.min;
import static java.util.Collections.emptyList;
import static java.util.Optional.ofNullable;
import static java.util.concurrent.TimeUnit.SECONDS;
import static java.util.function.Predicate.not;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.container.AsyncResponse;
import jakarta.ws.rs.container.Suspended;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.chat.Channel;
import cloud.imagey.domain.chat.Message;
import cloud.imagey.domain.chat.MessageContent;
import cloud.imagey.domain.chat.MessageId;
import cloud.imagey.domain.chat.MessageRepository;
import cloud.imagey.domain.chat.MessageService;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

@Path("{userId}/contacts/{contact}/messages")
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
        @PathParam("userId") UserId senderId,
        @PathParam("contactId") UserId contactId,
        MessageContent messageContent,
        @Context UriInfo uriInfo) throws IOException {
        User contact = new User(contactId, null);
        User sender = new User(senderId, null);

        Message message = messageService.sendMessage(sender, contact, messageContent);
        return Response.created(uriInfo.getAbsolutePathBuilder().path(message.id().value()).build()).build();
    }

    @GET
    @RolesAllowed("owner")
    @Produces(APPLICATION_JSON)
    public void receiveMessages(
        @PathParam("userId") UserId receiverId,
        @PathParam("contact") User sender,
        @QueryParam("sinceId") MessageId sinceId,
        @HeaderParam("Prefer") Prefer prefer,
        @Suspended AsyncResponse asyncResponse) {
        User receiver = new User(receiverId, null);

        long timeout = min(pollingTimeoutSeconds, ofNullable(prefer).map(Prefer::timeout).orElse(0L));

        List<Message> messages = messageRepository.fetchMessages(receiver, sender, Optional.ofNullable(sinceId));
        if (messages.isEmpty() && timeout > 0) {
            asyncResponse.setTimeout(timeout, SECONDS);
            asyncResponse.setTimeoutHandler(ar -> ar.resume(Response.ok(emptyList()).build()));

            Channel channel = new Channel(sender.id().id() + ":" + receiver.id().id());
            waitingRequests.computeIfAbsent(channel, c -> new ConcurrentLinkedQueue<>()).add(asyncResponse);
        } else {
            asyncResponse.resume(messages);
        }
    }

    public void sendMessage(@Observes Message message) {
        ofNullable(waitingRequests.remove(message.channel())).ifPresent(responses
            -> responses.stream().filter(not(AsyncResponse::isDone)).forEach(response -> response.resume(List.of(message))));
    }

    public record Prefer(String value) {
        long timeout() {
            Matcher matcher = Pattern.compile("wait=(\\d+)").matcher(value);
            if (matcher.find()) {
                try {
                    return Long.parseLong(matcher.group(1));
                } catch (NumberFormatException e) {
                    // ignore
                }
            }
            return 0;
        }
    }
}
