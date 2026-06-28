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

import java.util.Optional;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;

@ApplicationScoped
public class WebPushService {

    private static final Logger LOG = LogManager.getLogger(WebPushService.class);

    @Inject
    @ConfigProperty(name = "VAPID_PUBLIC_KEY")
    private Optional<String> vapidPublicKey;

    @Inject
    @ConfigProperty(name = "VAPID_PRIVATE_KEY")
    private Optional<String> vapidPrivateKey;

    @Inject
    private cloud.imagey.domain.user.DeviceRepository deviceRepository;

    private PushService pushService;

    @PostConstruct
    public void init() {
        if (vapidPublicKey.isPresent() && vapidPrivateKey.isPresent()) {
            try {
                this.pushService = new PushService(vapidPublicKey.get(), vapidPrivateKey.get());
                LOG.info("Web Push feature is enabled.");
            } catch (Exception e) {
                LOG.error("Failed to initialize Web Push Service: " + e.getMessage());
            }
        } else {
            LOG.info("Web Push feature is disabled. VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing.");
        }
    }

    public Optional<String> getPublicKey() {
        return pushService != null ? vapidPublicKey : Optional.empty();
    }

    public void onMessage(@jakarta.enterprise.event.Observes cloud.imagey.domain.chat.Message message) {
        if (pushService == null) {
            return;
        }
        String[] parts = message.channel().value().split(":");
        cloud.imagey.domain.user.User receiver = new cloud.imagey.domain.user.User(new cloud.imagey.domain.mail.Email(parts[1]));
        java.util.List<PushSubscription> subscriptions = deviceRepository.loadPushSubscriptions(receiver);
        subscriptions.forEach(this::sendNotification);
    }

    public void sendNotification(PushSubscription subscription) {
        if (pushService == null) {
            return;
        }
        try {
            Notification notification = new Notification(
                subscription.endpoint(),
                subscription.p256dh(),
                subscription.auth(),
                new byte[0]
            );
            pushService.send(notification);
        } catch (Exception e) {
            LOG.error("Failed to send push notification", e);
        }
    }
}
