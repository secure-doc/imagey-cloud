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

import javax.annotation.PostConstruct;
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
public class UserRepository {

    private static final Logger LOG = LogManager.getLogger(UserRepository.class);
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @PostConstruct
    public void logRootPath() {
        LOG.info("root.path = {}", rootPath);
    }

    public void persist(User user) {
        File userHome = getUserHome(user);
        if (userHome.exists()) {
            throw new ResourceConflictException(userHome + " already exists");
        }
        if (!userHome.mkdir()) {
            throw new ResourceConflictException(userHome + " could not be created");
        }
    }

    public boolean exists(User user) {
        return getUserHome(user).exists();
    }

    public String getUser(User user) {
        return String.format("""
                {
                    "email": "%s"
                }
                """, user.email());
    }

    public Optional<String> loadPublicKey(User user, Kid kid) {
        LOG.info("Loading public key with kid {}", kid);
        File publicKeysFolder = new File(getUserHome(user), "public-keys");
        File keyFile = new File(publicKeysFolder, kid.id() + ".json");
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

    public void storePublicKey(User user, Kid kid, PublicKey publicKey) throws IOException {
        File publicKeysFolder = new File(getUserHome(user), "public-keys");
        if (!publicKeysFolder.exists()) {
            publicKeysFolder.mkdirs();
        }
        File keyFile = new File(publicKeysFolder, kid.id() + ".json");
        if (keyFile.exists()) {
            throw new ResourceConflictException(keyFile + " already exists.");
        }
        FileUtils.write(keyFile, publicKey.key(), UTF_8, false);
    }

    public void createDevicePublicKey(User user, DeviceId deviceId, String key) throws IOException {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "public-keys");
        if (!keyDirectory.exists()) {
            keyDirectory.mkdirs();
        }
        File keyFile = new File(keyDirectory, "0.json");
        if (keyFile.exists()) {
            throw new ResourceConflictException(keyFile + " already exists.");
        }
        FileUtils.write(keyFile, key, UTF_8, false);
    }

    public void storeEncryptedPrivateKey(User user, DeviceId deviceId, EncryptedPrivateKey privateKey) throws IOException {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "private-keys");
        if (!keyDirectory.exists()) {
            keyDirectory.mkdirs();
        }
        File keyFile = new File(keyDirectory, "0.json");
        if (keyFile.exists()) {
            throw new ResourceConflictException(keyFile + " already exists.");
        }
        FileUtils.write(keyFile, privateKey.key(), UTF_8, false);
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}
