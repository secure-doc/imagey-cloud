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
package cloud.imagey.domain.push;

import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.ObservesAsync;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObjectBuilder;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.DeviceRepository;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.push.PushGateway;
import cloud.imagey.infrastructure.push.PushGateway.Result;
import cloud.imagey.infrastructure.push.VapidKeys;

/**
 * Sends a {@link PushEvent} to every device its recipient has subscribed from (ADR 0020) - observed
 * asynchronously, so it never delays or fails whatever fired the event. Metadata only: the payload is
 * serialized here, adding {@code recipient} itself (never trusting a caller-supplied value), and never
 * carries plaintext - the subscriber's device decrypts a preview locally, or falls back to a generic
 * notification.
 */
@ApplicationScoped
public class PushNotificationService {

    private static final Logger LOG = LogManager.getLogger(PushNotificationService.class);

    @Inject
    private VapidKeys vapidKeys;
    @Inject
    private PushGateway gateway;
    @Inject
    private DeviceRepository deviceRepository;

    public void onPush(@ObservesAsync PushEvent event) {
        if (!vapidKeys.isEnabled()) {
            return;
        }
        String payload = serialize(event);
        boolean highUrgency = event.payload() instanceof MessagePayload;
        for (Map.Entry<DeviceId, PushSubscription> entry
            : deviceRepository.loadPushSubscriptions(event.recipient()).entrySet()) {

            send(event.recipient(), entry.getKey(), entry.getValue(), payload, highUrgency);
        }
    }

    private void send(
        User recipient, DeviceId deviceId, PushSubscription subscription, String payload, boolean highUrgency) {

        try {
            Result result = gateway.send(
                subscription.endpoint(), subscription.p256dh(), subscription.auth(), payload, highUrgency);
            if (result == Result.GONE) {
                deviceRepository.deletePushSubscription(recipient, deviceId);
            }
        } catch (RuntimeException e) {
            LOG.warn("Failed to push-notify a device", e);
        }
    }

    private static String serialize(PushEvent event) {
        JsonObjectBuilder builder = Json.createObjectBuilder()
            .add("type", event.payload().type())
            .add("recipient", event.recipient().id().id());
        if (event.payload() instanceof MessagePayload message) {
            builder.add("owner", message.owner().id().id())
                .add("chatId", message.chatId().id())
                .add("messageId", message.messageId().value());
        }
        return builder.build().toString();
    }
}
