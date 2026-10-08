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

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;

class FederationAddressTest {

    @Test
    @DisplayName("A plain address is accepted and lower-cased")
    void accepts() {
        assertThat(FederationAddress.parse("Bob@Example.COM")).contains(new Email("bob@example.com"));
    }

    @Test
    @DisplayName("Anything else is not an address")
    void rejects() {
        assertThat(FederationAddress.parse(null)).isEmpty();
        assertThat(FederationAddress.parse("bob")).isEmpty();
        assertThat(FederationAddress.parse("a@b@c.de")).isEmpty();
        assertThat(FederationAddress.parse("bob @example.com")).isEmpty();
        assertThat(FederationAddress.parse("bob@localhost")).isEmpty();
        assertThat(FederationAddress.parse("a".repeat(250) + "@b.de")).isEmpty();
    }
}
