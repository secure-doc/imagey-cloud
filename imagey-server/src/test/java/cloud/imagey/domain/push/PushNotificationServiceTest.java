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

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.contact.MessageId;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.DeviceRepository;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.infrastructure.push.PushGateway;
import cloud.imagey.infrastructure.push.VapidKeys;

class PushNotificationServiceTest {

    private static final User RECIPIENT = new User(new UserId("recipient"));
    private static final DeviceId DEVICE_A = new DeviceId("device-a");
    private static final DeviceId DEVICE_B = new DeviceId("device-b");
    private static final String P256DH = unpadded(new byte[65]);
    private static final String AUTH = unpadded(new byte[16]);
    private static final PushSubscription SUBSCRIPTION_A =
        new PushSubscription("https://push.example.net/a", P256DH, AUTH);
    private static final PushSubscription SUBSCRIPTION_B =
        new PushSubscription("https://push.example.net/b", P256DH, AUTH);

    @Test
    @DisplayName("Sends to every subscribed device and deletes the one the gateway reports gone")
    void sendsToEveryDeviceAndDeletesGoneOnes() throws Exception {
        FakeGateway gateway = new FakeGateway();
        gateway.results.put(SUBSCRIPTION_A.endpoint(), PushGateway.Result.SENT);
        gateway.results.put(SUBSCRIPTION_B.endpoint(), PushGateway.Result.GONE);
        FakeDeviceRepository repository = new FakeDeviceRepository(orderedMap(DEVICE_A, SUBSCRIPTION_A, DEVICE_B, SUBSCRIPTION_B));

        service(enabledVapidKeys(), gateway, repository).onPush(new PushEvent(
            RECIPIENT, new MessagePayload(RECIPIENT, new DocumentId("chat"), new MessageId("m1"))));

        assertThat(gateway.calls).hasSize(2);
        assertThat(repository.deleted).containsExactly(DEVICE_B);
    }

    @Test
    @DisplayName("Does nothing while push is disabled")
    void doesNothingWhenDisabled() throws Exception {
        FakeGateway gateway = new FakeGateway();
        FakeDeviceRepository repository = new FakeDeviceRepository(orderedMap(DEVICE_A, SUBSCRIPTION_A));

        service(new VapidKeys(), gateway, repository).onPush(new PushEvent(RECIPIENT, new ContactRequestPayload()));

        assertThat(gateway.calls).isEmpty();
        assertThat(repository.loadPushSubscriptionsCalled).isFalse();
    }

    @Test
    @DisplayName("An exception sending to one device does not stop the others")
    void exceptionForOneDeviceDoesNotStopTheOthers() throws Exception {
        FakeGateway gateway = new FakeGateway() {
            @Override
            public PushGateway.Result send(String endpoint, String p256dh, String auth, String payload, boolean highUrgency) {
                if (endpoint.equals(SUBSCRIPTION_A.endpoint())) {
                    throw new IllegalStateException("boom");
                }
                return super.send(endpoint, p256dh, auth, payload, highUrgency);
            }
        };
        FakeDeviceRepository repository = new FakeDeviceRepository(orderedMap(DEVICE_A, SUBSCRIPTION_A, DEVICE_B, SUBSCRIPTION_B));

        service(enabledVapidKeys(), gateway, repository).onPush(new PushEvent(
            RECIPIENT, new MessagePayload(RECIPIENT, new DocumentId("chat"), new MessageId("m1"))));

        assertThat(gateway.calls).hasSize(1);
        assertThat(repository.deleted).isEmpty();
    }

    @Test
    @DisplayName("A message payload is serialized with recipient/owner/chatId/messageId and pushed with high urgency")
    void serializesMessagePayload() throws Exception {
        FakeGateway gateway = new FakeGateway();
        FakeDeviceRepository repository = new FakeDeviceRepository(orderedMap(DEVICE_A, SUBSCRIPTION_A));
        MessageId messageId = new MessageId("the-message-id");

        service(enabledVapidKeys(), gateway, repository).onPush(new PushEvent(
            RECIPIENT, new MessagePayload(new User(new UserId("owner-id")), new DocumentId("chat-1"), messageId)));

        assertThat(gateway.calls).hasSize(1);
        FakeGateway.Call call = gateway.calls.get(0);
        assertThat(call.highUrgency).isTrue();
        assertThat(call.payload).contains(
            "\"type\":\"message\"", "\"recipient\":\"recipient\"", "\"owner\":\"owner-id\"",
            "\"chatId\":\"chat-1\"", "\"messageId\":\"the-message-id\"");
    }

    @Test
    @DisplayName("A contact-accepted event is serialized without message fields and pushed without high urgency")
    void serializesContactAcceptedPayload() throws Exception {
        FakeGateway gateway = new FakeGateway();
        FakeDeviceRepository repository = new FakeDeviceRepository(orderedMap(DEVICE_A, SUBSCRIPTION_A));

        service(enabledVapidKeys(), gateway, repository).onPush(new PushEvent(RECIPIENT, new ContactAcceptedPayload()));

        FakeGateway.Call call = gateway.calls.get(0);
        assertThat(call.highUrgency).isFalse();
        assertThat(call.payload).contains("\"type\":\"contact-accepted\"", "\"recipient\":\"recipient\"").doesNotContain("owner");
    }

    @Test
    @DisplayName("A contact-request event is serialized without message fields and pushed without high urgency")
    void serializesContactRequestPayload() throws Exception {
        FakeGateway gateway = new FakeGateway();
        FakeDeviceRepository repository = new FakeDeviceRepository(orderedMap(DEVICE_A, SUBSCRIPTION_A));

        service(enabledVapidKeys(), gateway, repository).onPush(new PushEvent(RECIPIENT, new ContactRequestPayload()));

        FakeGateway.Call call = gateway.calls.get(0);
        assertThat(call.highUrgency).isFalse();
        assertThat(call.payload).contains("\"type\":\"contact-request\"", "\"recipient\":\"recipient\"").doesNotContain("owner");
    }

    private static VapidKeys enabledVapidKeys() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();
        VapidKeys keys = new VapidKeys();
        setField(keys, "publicKey", pair.getPublic());
        setField(keys, "privateKey", pair.getPrivate());
        return keys;
    }

    private static PushNotificationService service(VapidKeys vapidKeys, PushGateway gateway, DeviceRepository repository) {
        PushNotificationService service = new PushNotificationService();
        setField(service, "vapidKeys", vapidKeys);
        setField(service, "gateway", gateway);
        setField(service, "deviceRepository", repository);
        return service;
    }

    private static Map<DeviceId, PushSubscription> orderedMap(Object... entries) {
        Map<DeviceId, PushSubscription> map = new LinkedHashMap<>();
        for (int i = 0; i < entries.length; i += 2) {
            map.put((DeviceId) entries[i], (PushSubscription) entries[i + 1]);
        }
        return map;
    }

    private static String unpadded(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static class FakeGateway implements PushGateway {

        private final List<Call> calls = new ArrayList<>();
        private final Map<String, Result> results = new LinkedHashMap<>();

        @Override
        public Result send(String endpoint, String p256dh, String auth, String payload, boolean highUrgency) {
            calls.add(new Call(endpoint, payload, highUrgency));
            return results.getOrDefault(endpoint, Result.SENT);
        }

        private record Call(String endpoint, String payload, boolean highUrgency) {
        }
    }

    private static final class FakeDeviceRepository extends DeviceRepository {

        private final Map<DeviceId, PushSubscription> subscriptions;
        private final List<DeviceId> deleted = new ArrayList<>();
        private boolean loadPushSubscriptionsCalled;

        FakeDeviceRepository(Map<DeviceId, PushSubscription> subscriptions) {
            this.subscriptions = subscriptions;
        }

        @Override
        public Map<DeviceId, PushSubscription> loadPushSubscriptions(User user) {
            loadPushSubscriptionsCalled = true;
            return subscriptions;
        }

        @Override
        public void deletePushSubscription(User user, DeviceId deviceId) {
            deleted.add(deviceId);
        }
    }
}
