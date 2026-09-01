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

import static java.util.Objects.requireNonNull;

import java.util.UUID;

/**
 * The stable, opaque identifier of a user account (a random UUID), assigned once at registration
 * and used as the account's identity everywhere on the server: the storage directory name
 * ({@code <root.path>/<userId>}), the {@code {userId}} path segment, the JWT subject of an
 * authenticated session, and the {@code issuer} of a shared key. The user's email address never
 * serves as an identifier - it is resolved to a {@code UserId} through {@link UserMappingService}.
 */
public record UserId(String id) {

    public UserId {
        requireNonNull(id, "id");
    }

    public static UserId random() {
        return new UserId(UUID.randomUUID().toString());
    }
}
