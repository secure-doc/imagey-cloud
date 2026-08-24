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
import java.nio.charset.Charset;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;

@ApplicationScoped
public class UserRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(UserRepository.class);
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    public void persist(User user) {
        File userHome = createNewFile(rootPath(), user.email().address());
        mkdir(userHome);
    }

    public boolean exists(User user) {
        return getUserHome(user).exists();
    }

    /**
     * Whether {@code user} has actually completed registration, as opposed to merely having a home
     * directory - which {@link cloud.imagey.domain.contact.ContactRepository#persist} creates for a
     * not-yet-registered invitee. Registration always stores the main public key under kid {@code 0}
     * (see {@link cloud.imagey.domain.user.UserService#register}), so its presence is the marker.
     * Used for register-vs-login routing and the invite flow, where a bare directory must still
     * count as "no account yet".
     */
    public boolean isRegistered(User user) {
        return new File(new File(getUserHome(user), "public-keys"), "0.json").exists();
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

    public void storePublicKey(User user, Kid kid, PublicKey publicKey) {
        File publicKeysFolder = new File(getUserHome(user), "public-keys");
        createNewFileWithContent(publicKeysFolder, kid.id() + ".json", publicKey.key());
    }
}
