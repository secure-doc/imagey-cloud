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
package cloud.imagey.domain.federation;

import java.util.Optional;
import java.util.regex.Pattern;

import cloud.imagey.domain.mail.Email;

/**
 * An email address as federation names it (the {@code sub} of an assertion, the address of a foreign
 * principal). Deliberately plain: one {@code @}, no whitespace, a dotted domain. A mailbox is proven by
 * the invitation link, not by this syntax check - it only keeps garbage out of the mapping keys.
 */
public final class FederationAddress {

    private static final int MAX_LENGTH = 254;
    private static final Pattern PATTERN = Pattern.compile("[^@\\s]+@[^@\\s]+\\.[^@\\s]+");

    private FederationAddress() {
    }

    /** The (lower-cased) address, or empty if {@code address} is not a plain mailbox address. */
    public static Optional<Email> parse(String address) {
        if (address == null || address.length() > MAX_LENGTH || !PATTERN.matcher(address).matches()) {
            return Optional.empty();
        }
        return Optional.of(new Email(address));
    }
}
