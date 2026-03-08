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

import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class UserRepository extends AbstractFileRepository {

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
        File userHome = createNewFile(new File(rootPath), user.email().address());
        mkdir(userHome);
    }

    public boolean exists(User user) {
        return getUserHome(user).exists();
    }

    public Optional<String> loadPublicKey(User user, Kid kid) {
        LOG.info("Loading public key with kid {}", kid);
        File publicKeysFolder = new File(getUserHome(user), "public-keys");
        File keyFile = new File(publicKeysFolder, kid.id() + ".json");
        if (!keyFile.exists()) {
            LOG.info("Public key does not exist.");
            return empty();
        } else {
            Optional<String> publicKey = of(readFileToString(keyFile));
            LOG.info("Public key loaded");
            return publicKey;
        }
    }

    public void storePublicKey(User user, Kid kid, PublicKey publicKey) throws IOException {
        File publicKeysFolder = new File(getUserHome(user), "public-keys");
        if (!publicKeysFolder.exists()) {
            publicKeysFolder.mkdirs();
        }
        File keyFile = createNewFile(publicKeysFolder, kid.id() + ".json");
        FileUtils.write(keyFile, publicKey.key(), UTF_8, false);
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}
