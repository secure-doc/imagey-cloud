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

import static java.util.Optional.empty;
import static java.util.Optional.of;
import static org.apache.commons.io.FileUtils.readFileToString;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.Optional;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import org.apache.commons.io.FileUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.encryption.EncryptedPrivateKey;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class DeviceRepository {

    private static final Logger LOG = LogManager.getLogger(DeviceRepository.class);
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public Optional<String> loadPrivateKey(User user, DeviceId deviceId, Kid kid) {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "private-keys");
        File keyFile = new File(keyDirectory, kid.id() + ".enc");
        if (!keyFile.exists()) {
            LOG.info("Private key does not exist.");
            return empty();
        } else {
            try {
                Optional<String> publicKey = of(readFileToString(keyFile, UTF_8));
                LOG.info("Private key loaded");
                return publicKey;
            } catch (IOException e) {
                LOG.error("Private key could not be loaded", e);
                throw new IllegalStateException(e);
            }
        }
    }

    public void storeDevicePublicKey(User user, DeviceId deviceId, PublicKey key) throws IOException {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "public-keys");
        if (!keyDirectory.exists()) {
            keyDirectory.mkdirs();
        }
        File keyFile = new File(keyDirectory, "0.json");
        if (keyFile.exists()) {
            throw new ResourceConflictException(keyFile + " already exists.");
        }
        FileUtils.write(keyFile, key.key(), UTF_8, false);
    }

    public Optional<String> loadDevicePublicKey(User user, DeviceId deviceId, Kid kid) {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "public-keys");
        File keyFile = new File(keyDirectory, "0.json");
        if (!keyFile.exists()) {
            LOG.info("Public key does not exist.");
            return empty();
        } else {
            try {
                Optional<String> publicKey = of(readFileToString(keyFile, UTF_8));
                LOG.info("Public key loaded");
                return publicKey;
            } catch (IOException e) {
                LOG.error("Public key could not be loaded", e);
                throw new IllegalStateException(e);
            }
        }
    }

    public void storeEncryptedPrivateKey(User user, DeviceId deviceId, EncryptedPrivateKey privateKey) throws IOException {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "private-keys");
        if (!keyDirectory.exists()) {
            keyDirectory.mkdirs();
        }
        File keyFile = new File(keyDirectory, "0.enc");
        if (keyFile.exists()) {
            throw new ResourceConflictException(keyFile + " already exists.");
        }
        FileUtils.write(keyFile, privateKey.key(), UTF_8, false);
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}
