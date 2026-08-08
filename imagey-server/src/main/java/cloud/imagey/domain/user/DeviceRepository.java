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
import static java.util.Arrays.stream;
import static java.util.Optional.empty;
import static java.util.Optional.of;

import java.io.File;
import java.util.List;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.PrivateKeyMetadata;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class DeviceRepository extends AbstractFileRepository {

    private static final Logger LOG = LogManager.getLogger(DeviceRepository.class);

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public List<DeviceId> loadDevices(User user) {
        File devicesDirectory = new File(getUserHome(user), "devices");
        return stream(devicesDirectory.list()).sorted().map(DeviceId::new).toList();
    }

    public Optional<PrivateKeyMetadata> loadPrivateKey(User user, DeviceId deviceId, Kid kid) {
        return loadPrivateKeyJson(user, deviceId, kid).map(this::parse);
    }

    public Optional<String> loadPrivateKeyJson(User user, DeviceId deviceId, Kid kid) {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "private-keys");
        return of(new File(keyDirectory, kid.id() + ".json"))
            .filter(File::exists)
            .map(this::readFileToString);
    }

    public void storeDevicePublicKey(User user, DeviceId deviceId, PublicKey key) {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "public-keys");
        createNewFileWithContent(keyDirectory, "0.json", key.key());
    }

    public Optional<PublicKey> loadDevicePublicKey(User user, DeviceId deviceId, Kid kid) {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "public-keys");
        File keyFile = new File(keyDirectory, kid.id() + ".json");
        if (!keyFile.exists()) {
            LOG.info("Public key does not exist.");
            return empty();
        } else {
            Optional<PublicKey> publicKey = of(readFileToString(keyFile)).map(PublicKey::new);
            LOG.info("Public key loaded");
            return publicKey;
        }
    }

    public void storeEncryptedPrivateKey(User user, DeviceId deviceId, PrivateKeyMetadata metadata) {
        storeEncryptedPrivateKey(user, deviceId, create().toJson(metadata));
    }

    public void storeEncryptedPrivateKey(User user, DeviceId deviceId, String metadata) {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "private-keys");
        if (!keyDirectory.exists()) {
            keyDirectory.mkdirs();
        }
        createNewFileWithContent(keyDirectory, "0.json", metadata);
    }

    public void storeDeviceRecoveryKey(User user, DeviceId deviceId, String recoveryKey) {
        File deviceDirectory = new File(new File(getUserHome(user), "devices"), deviceId.id());
        createNewFileWithContent(deviceDirectory, "recovery-key.txt", recoveryKey);
    }

    public Optional<String> loadDeviceRecoveryKey(User user, DeviceId deviceId) {
        File recoveryKeyFile = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "recovery-key.txt");
        if (!recoveryKeyFile.exists()) {
            LOG.info("Recovery key does not exist.");
            return empty();
        } else {
            Optional<String> recoveryKey = of(readFileToString(recoveryKeyFile));
            LOG.info("Recovery key loaded");
            return recoveryKey;
        }
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }

    private PrivateKeyMetadata parse(String json) {
        return create().fromJson(json, PrivateKeyMetadata.class);
    }
}
