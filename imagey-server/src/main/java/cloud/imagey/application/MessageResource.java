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
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.container.AsyncResponse;
import jakarta.ws.rs.container.Suspended;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.contact.Channel;
import cloud.imagey.domain.contact.Message;
import cloud.imagey.domain.contact.MessageContent;
import cloud.imagey.domain.contact.MessageId;
import cloud.imagey.domain.contact.MessageRepository;
import cloud.imagey.domain.contact.MessageService;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

@Path("{userId}/documents/{chatId}/messages")
@ApplicationScoped
public class MessageResource {

    /** Guards against an abusive header rather than any real chat size - see {@code MessageService}. */
    private static final int MAX_NOTIFY_RECIPIENTS = 256;
    /**
     * What a user id in the Notify header may look like (a UUID, and nothing that is a path segment of its own): it
     * ends up in file names, and unlike a URL path segment a header may contain slashes and dots.
     */
    private static final Pattern NOTIFY_RECIPIENT = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    @Inject
    private MessageService messageService;
    @Inject
    private MessageRepository messageRepository;
    @Inject
    @ConfigProperty(name = "chat.polling.timeout", defaultValue = "30")
    private long pollingTimeoutSeconds;
    @Context
    private SecurityContext securityContext;
    private Map<Channel, Queue<AsyncResponse>> waitingRequests = new ConcurrentHashMap<>();

    @POST
    @RolesAllowed({"owner", "member"})
    @Consumes(TEXT_PLAIN)
    @Produces(APPLICATION_JSON)
    public Response sendMessage(
        @PathParam("userId") User owner,
        @PathParam("chatId") DocumentId chatId,
        MessageContent messageContent,
        @HeaderParam("Notify") String notify,
        @Context UriInfo uriInfo) throws IOException {

        Message message = messageService.sendMessage(owner, chatId, caller(), messageContent, parseNotify(notify));
        return Response.created(uriInfo.getAbsolutePathBuilder().path(message.id().value()).build())
            .entity(new SentMessage(message.id(), message.timestamp()))
            .build();
    }

    // The chat's last activity (ADR 0021): Last-Modified is the time of its newest message, absent
    // for a chat without messages. The same access check as the GET applies.
    @HEAD
    @RolesAllowed({"owner", "member"})
    public Response lastActivity(@PathParam("userId") User owner, @PathParam("chatId") DocumentId chatId) {
        Response.ResponseBuilder response = Response.ok();
        messageRepository.findLatestTimestamp(owner, chatId)
            .ifPresent(timestamp -> response.lastModified(Date.from(timestamp.instant())));
        return response.build();
    }

    @GET
    @RolesAllowed({"owner", "member"})
    @Path("{messageId}")
    @Produces(APPLICATION_JSON)
    public Message getMessage(
        @PathParam("userId") User owner,
        @PathParam("chatId") DocumentId chatId,
        @PathParam("messageId") MessageId messageId) {

        return messageRepository.fetchMessage(owner, chatId, messageId).orElseThrow(NotFoundException::new);
    }

    @GET
    @RolesAllowed({"owner", "member"})
    @Produces(APPLICATION_JSON)
    public void receiveMessages(
        @PathParam("userId") User owner,
        @PathParam("chatId") DocumentId chatId,
        @QueryParam("sinceId") MessageId sinceId,
        @HeaderParam("Prefer") Prefer prefer,
        @Suspended AsyncResponse asyncResponse) {

        long timeout = min(pollingTimeoutSeconds, ofNullable(prefer).map(Prefer::timeout).orElse(0L));

        List<Message> messages = messageRepository.fetchMessages(owner, chatId, Optional.ofNullable(sinceId));
        if (messages.isEmpty() && timeout > 0) {
            asyncResponse.setTimeout(timeout, SECONDS);
            asyncResponse.setTimeoutHandler(ar -> ar.resume(Response.ok(emptyList()).build()));

            Channel channel = new Channel(chatId.id());
            waitingRequests.computeIfAbsent(channel, c -> new ConcurrentLinkedQueue<>()).add(asyncResponse);
        } else {
            asyncResponse.resume(messages);
        }
    }

    public void onMessageSent(@Observes Message message) {
        ofNullable(waitingRequests.remove(message.channel())).ifPresent(responses
            -> responses.stream().filter(not(AsyncResponse::isDone)).forEach(response -> response.resume(List.of(message))));
    }

    private User caller() {
        return new User(new UserId(securityContext.getUserPrincipal().getName()));
    }

    // The other chat members to push-notify (ADR 0020 decision 4) - MessageService only actually
    // notifies the ones that pass its own access check, so this header cannot be used to spam anyone.
    private static Set<User> parseNotify(String notify) {
        if (notify == null || notify.isBlank()) {
            return Set.of();
        }
        // limit -1: keeps trailing empty segments (e.g. "a,,") so they are rejected below, rather
        // than silently discarded by split's default behaviour.
        String[] parts = notify.split(",", -1);
        if (parts.length > MAX_NOTIFY_RECIPIENTS) {
            throw new BadRequestException("Notify header names too many recipients");
        }
        Set<User> recipients = new LinkedHashSet<>();
        for (String part : parts) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                throw new BadRequestException("Notify header contains an empty recipient");
            }
            if (!NOTIFY_RECIPIENT.matcher(trimmed).matches()) {
                throw new BadRequestException("Notify header contains an invalid recipient");
            }
            recipients.add(new User(new UserId(trimmed)));
        }
        return recipients;
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
