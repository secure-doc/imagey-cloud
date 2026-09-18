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

import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.encryption.PublicKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.infrastructure.ResourceConflictException;

@ApplicationScoped
public class UserRepository extends AbstractUserFileRepository {

    private static final Logger LOG = LogManager.getLogger(UserRepository.class);

    // Not empty: an object store cannot represent "a home directory with nothing in it" the way a
    // bare `mkdir` could, so registration needs a real key to create-only against. Content is a
    // placeholder today, but the key stays room for future per-account metadata without a migration.
    private static final String ACCOUNT_MARKER_CONTENT = "{}";

    public void persist(User user) {
        if (!putIfAbsent(accountMarker(user), ACCOUNT_MARKER_CONTENT.getBytes(UTF_8))) {
            throw new ResourceConflictException(user.id().id() + " already exists");
        }
    }

    public boolean exists(User user) {
        return exists(accountMarker(user));
    }

    /**
     * Whether {@code user} has actually completed registration, as opposed to merely having a
     * pending invitation on file - which {@link cloud.imagey.domain.contact.ContactRepository#persist}
     * creates for a not-yet-registered invitee, without ever touching the account marker.
     * Registration always stores the main public key under kid {@code 0} (see
     * {@link cloud.imagey.domain.user.UserService#register}), so its presence is the marker. Used
     * for register-vs-login routing and the invite flow, where a pending invitation must still count
     * as "no account yet".
     */
    public boolean isRegistered(User user) {
        return exists(join(getUserPrefix(user), "public-keys", "0.json"));
    }

    public Optional<String> loadPublicKey(User user, Kid kid) {
        LOG.info("Loading public key with kid {}", kid);
        Optional<String> publicKey = findString(join(getUserPrefix(user), "public-keys", kid.id() + ".json"));
        if (publicKey.isEmpty()) {
            LOG.info("Public key does not exist.");
        } else {
            LOG.info("Public key loaded");
        }
        return publicKey;
    }

    public void storePublicKey(User user, Kid kid, PublicKey publicKey) {
        createIfAbsent(join(getUserPrefix(user), "public-keys", kid.id() + ".json"), publicKey.key());
    }

    private String accountMarker(User user) {
        return join(getUserPrefix(user), "account.json");
    }
}
