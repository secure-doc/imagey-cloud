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

import jakarta.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.infrastructure.record.AbstractSimpleRecordAdapter;

/**
 * A user account, identified solely by its {@link UserId}. The email address is not part of the
 * account identity on the server - it lives only in the client-encrypted profile document and in
 * the {@link UserMappingService} lookup table. Wherever an email is genuinely needed (sending
 * mail, the unauthenticated verification endpoint) it is passed as its own {@link
 * cloud.imagey.domain.mail.Email} type, never folded into {@code User}.
 */
@JsonbTypeAdapter(User.Adapter.class)
public record User(UserId id) {

    public User {
        requireNonNull(id, "id");
    }

    public static class Adapter extends AbstractSimpleRecordAdapter<User, String> {
    }
}
