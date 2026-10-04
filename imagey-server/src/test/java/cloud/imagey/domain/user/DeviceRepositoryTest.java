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
package cloud.imagey.domain.user;

import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.push.PushSubscription;

@MonoMeecrowaveConfig
public class DeviceRepositoryTest {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    private DeviceRepository deviceRepository;

    private User user;
    private DeviceId deviceId;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new UserId("test-user"));
        deviceId = new DeviceId("test-device");
    }

    @Test
    @DisplayName("store recovery key when the device directory does not exist yet")
    void storeRecoveryKeyCreatesDirectory() {
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, "\"first-key\"");

        assertThat(deviceRepository.loadDeviceRecoveryKey(user, deviceId)).contains("\"first-key\"");
    }

    @Test
    @DisplayName("storing a new recovery key overwrites the previous one")
    void storeRecoveryKeyOverwrites() {
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, "\"first-key\"");
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, "\"rotated-key\"");

        assertThat(deviceRepository.loadDeviceRecoveryKey(user, deviceId)).contains("\"rotated-key\"");
    }

    @Test
    @DisplayName("a device without private key and info is listed as not activated and undescribed")
    void loadUndescribedDevice() {
        deviceRepository.storeDevicePublicKey(user, deviceId, new PublicKey("{}"));

        assertThat(deviceRepository.loadDevices(user)).containsExactly(new Device(deviceId, false, new PublicKey("{}"), null));
    }

    @Test
    @DisplayName("storing the private key activates a device and its info is listed")
    void loadActivatedDescribedDevice() {
        deviceRepository.storeDevicePublicKey(user, deviceId, new PublicKey("{}"));
        deviceRepository.storeEncryptedPrivateKey(user, deviceId, "{}");
        deviceRepository.storeDeviceInfo(user, deviceId, new EncryptedDeviceInfo("AAAA"));

        assertThat(deviceRepository.isRegistered(user, deviceId)).isTrue();
        assertThat(deviceRepository.loadDevices(user))
            .containsExactly(new Device(deviceId, true, new PublicKey("{}"), new EncryptedDeviceInfo("AAAA")));
    }

    @Test
    @DisplayName("loadPushSubscriptions returns every device's subscription, and only that file")
    void loadPushSubscriptionsListsEveryDevice() {
        DeviceId otherDevice = new DeviceId("other-device");
        PushSubscription first = subscription("https://fcm.googleapis.com/send/a");
        PushSubscription second = subscription("https://fcm.googleapis.com/send/b");
        deviceRepository.storeDevicePublicKey(user, deviceId, new PublicKey("{}"));
        deviceRepository.storePushSubscription(user, deviceId, first);
        deviceRepository.storePushSubscription(user, otherDevice, second);

        Map<DeviceId, PushSubscription> subscriptions = deviceRepository.loadPushSubscriptions(user);

        assertThat(subscriptions).containsOnly(Map.entry(deviceId, first), Map.entry(otherDevice, second));
    }

    @Test
    @DisplayName("loadPushSubscriptions skips an invalid file and still returns the other devices' subscriptions")
    void loadPushSubscriptionsSkipsInvalidFile() throws IOException {
        PushSubscription valid = subscription("https://fcm.googleapis.com/send/a");
        deviceRepository.storePushSubscription(user, deviceId, valid);
        DeviceId corrupt = new DeviceId("corrupt-device");
        deviceRepository.storePushSubscription(user, corrupt, valid);
        for (String broken : List.of("not json", "{\"endpoint\":\"http://insecure.example.com\",\"p256dh\":\"x\",\"auth\":\"y\"}")) {
            overwritePushSubscriptionFile(corrupt, broken);

            assertThat(deviceRepository.loadPushSubscriptions(user)).containsOnly(Map.entry(deviceId, valid));
        }
    }

    private void overwritePushSubscriptionFile(DeviceId device, String content) throws IOException {
        try (Stream<Path> files = Files.walk(Path.of(rootPath))) {
            Path file = files
                .filter(path -> path.endsWith(Path.of("devices", device.id(), "push-subscription.json")))
                .findFirst()
                .orElseThrow();
            Files.writeString(file, content);
        }
    }

    @Test
    @DisplayName("storePushSubscription overwrites a previous subscription for the same device")
    void storePushSubscriptionOverwrites() {
        deviceRepository.storePushSubscription(user, deviceId, subscription("https://fcm.googleapis.com/send/old"));
        deviceRepository.storePushSubscription(user, deviceId, subscription("https://fcm.googleapis.com/send/new"));

        assertThat(deviceRepository.loadPushSubscriptions(user).get(deviceId).endpoint())
            .isEqualTo("https://fcm.googleapis.com/send/new");
    }

    @Test
    @DisplayName("deletePushSubscription removes it, without touching the device's other files")
    void deletePushSubscriptionRemovesOnlyThat() {
        deviceRepository.storeDevicePublicKey(user, deviceId, new PublicKey("{}"));
        deviceRepository.storePushSubscription(user, deviceId, subscription("https://fcm.googleapis.com/send/a"));

        deviceRepository.deletePushSubscription(user, deviceId);

        assertThat(deviceRepository.loadPushSubscriptions(user)).isEmpty();
        assertThat(deviceRepository.isRegistered(user, deviceId)).isTrue();
    }

    private static PushSubscription subscription(String endpoint) {
        String p256dh = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[65]);
        String auth = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);
        return new PushSubscription(endpoint, p256dh, auth);
    }
}
