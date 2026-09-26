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

import static jakarta.json.bind.JsonbBuilder.create;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.encryption.PrivateKeyMetadata;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;

@ApplicationScoped
public class DeviceRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(DeviceRepository.class);

    public List<Device> loadDevices(User user) {
        String devicesPrefix = join(getUserPrefix(user), "devices");
        return list(devicesPrefix).commonPrefixes().stream()
            .map(commonPrefix -> commonPrefix.substring(devicesPrefix.length() + 1, commonPrefix.length() - 1))
            .sorted()
            .map(DeviceId::new)
            .map(deviceId -> new Device(
                deviceId,
                isActivated(user, deviceId),
                loadDevicePublicKey(user, deviceId, new Kid("0")).orElse(null),
                loadDeviceInfo(user, deviceId).orElse(null)))
            .toList();
    }

    public boolean isRegistered(User user, DeviceId deviceId) {
        return exists(join(devicesFolder(user, deviceId), "public-keys", "0.json"));
    }

    /** Whether the device has its private main key, i.e. has been activated by another device. */
    public boolean isActivated(User user, DeviceId deviceId) {
        return exists(privateKeyFile(user, deviceId));
    }

    public void storeDeviceInfo(User user, DeviceId deviceId, EncryptedDeviceInfo info) {
        // Overwrite: renaming a device re-encrypts and replaces its whole info.
        put(join(devicesFolder(user, deviceId), "info.txt"), info.info());
    }

    public Optional<EncryptedDeviceInfo> loadDeviceInfo(User user, DeviceId deviceId) {
        return findString(join(devicesFolder(user, deviceId), "info.txt")).map(EncryptedDeviceInfo::new);
    }

    public Optional<PrivateKeyMetadata> loadPrivateKey(User user, DeviceId deviceId, Kid kid) {
        return findString(join(devicesFolder(user, deviceId), "private-keys", kid.id() + ".json")).map(this::parse);
    }

    public void storeDevicePublicKey(User user, DeviceId deviceId, PublicKey key) {
        createIfAbsent(join(devicesFolder(user, deviceId), "public-keys", "0.json"), key.key());
    }

    public Optional<PublicKey> loadDevicePublicKey(User user, DeviceId deviceId, Kid kid) {
        Optional<PublicKey> publicKey =
            findString(join(devicesFolder(user, deviceId), "public-keys", kid.id() + ".json")).map(PublicKey::new);
        if (publicKey.isEmpty()) {
            LOG.info("Public key does not exist.");
        } else {
            LOG.info("Public key loaded");
        }
        return publicKey;
    }

    public void storeEncryptedPrivateKey(User user, DeviceId deviceId, PrivateKeyMetadata metadata) {
        storeEncryptedPrivateKey(user, deviceId, convert(metadata));
    }

    public void storeEncryptedPrivateKey(User user, DeviceId deviceId, String metadata) {
        createIfAbsent(privateKeyFile(user, deviceId), metadata);
    }

    public void storeDeviceRecoveryKey(User user, DeviceId deviceId, String recoveryKey) {
        // Overwrite, do not create-only: the client mints a fresh random recovery key on every
        // "keep me logged in" sign-in and re-encrypts its local device-key blob with it. A
        // create-only write left the server holding the previous key, which then could not
        // decrypt that new local blob - auto-login failed and the user was thrown back to the
        // "unlock device" dialog on every single reload.
        put(join(devicesFolder(user, deviceId), "recovery-key.txt"), recoveryKey);
    }

    public Optional<String> loadDeviceRecoveryKey(User user, DeviceId deviceId) {
        Optional<String> recoveryKey = findString(join(devicesFolder(user, deviceId), "recovery-key.txt"));
        if (recoveryKey.isEmpty()) {
            LOG.info("Recovery key does not exist.");
        } else {
            LOG.info("Recovery key loaded");
        }
        return recoveryKey;
    }

    private String privateKeyFile(User user, DeviceId deviceId) {
        return join(devicesFolder(user, deviceId), "private-keys", "0.json");
    }

    private String devicesFolder(User user, DeviceId deviceId) {
        return join(getUserPrefix(user), "devices", deviceId.id());
    }

    private PrivateKeyMetadata parse(String json) {
        Map<String, String> map = create().fromJson(json, Map.class);
        return new PrivateKeyMetadata(map.get("kid"), map.get("encryptingDeviceId"), map.get("key"));
    }

    private String convert(PrivateKeyMetadata key) {
        return """
            {
                "kid": "0",
                "encryptingDeviceId": "${deviceId}",
                "key": "${key}"
            }
        """
        .replace("${deviceId}", key.encryptingDeviceId().id())
        .replace("${key}", key.key().key());
    }
}
