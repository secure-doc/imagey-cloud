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
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.token.Kid;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class UserRepository {

    private static final Charset UTF_8 = Charset.forName("UTF-8");
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public void persist(User user) {
        File userHome = getUserHome(user);
        if (userHome.exists()) {
            throw new ResourceConflictException();
        }
        if (!userHome.mkdir()) {
            throw new ResourceConflictException();
        }
    }

    public boolean exists(User user) {
        return getUserHome(user).exists();
    }

    public Optional<String> loadSymmetricKey(User user, Kid kid) {
        File symmetricKeysFolder = new File(getUserHome(user), "symmetric-keys");
        File keyFile = new File(symmetricKeysFolder, kid.id() + ".json");
        if (!keyFile.exists()) {
            return empty();
        } else {
            try {
                return of(readFileToString(keyFile, UTF_8));
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    public void storeSymmetricKey(User user, Kid kid, String key) throws IOException {
        File symmetricKeysFolder = new File(getUserHome(user), "symmetric-keys");
        if (!symmetricKeysFolder.exists()) {
            symmetricKeysFolder.mkdirs();
        }
        File keyFile = new File(symmetricKeysFolder, kid.id() + ".json");
        if (keyFile.exists()) {
            throw new ResourceConflictException();
        }
        FileUtils.write(keyFile, key, UTF_8, false);
    }

    public void storeDeviceKey(User user, DeviceId deviceId, Kid kid, String key) throws IOException {
        File keyDirectory = new File(new File(new File(getUserHome(user), "devices"), deviceId.id()), "keys");
        if (!keyDirectory.exists()) {
            keyDirectory.mkdirs();
        }
        File keyFile = new File(keyDirectory, kid.id() + ".json");
        if (keyFile.exists()) {
            keyFile.delete(); // override existing
        }
        FileUtils.write(keyFile, key, UTF_8, false);
    }

    private File getUserHome(User user) {
        return new File(rootPath, user.email().address());
    }
}
