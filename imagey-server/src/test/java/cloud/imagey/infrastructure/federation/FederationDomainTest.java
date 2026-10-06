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
package cloud.imagey.infrastructure.federation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class FederationDomainTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "secure-doc.store", "securedoc.localhost:8081", "xn--bcher-kva.example", "Secure-Doc.Store", "a.b:65535"})
    @DisplayName("A plain DNS name with an optional port is a domain, and is lower-cased")
    void valid(String domain) {
        assertThat(FederationDomain.normalize(domain)).hasValue(domain.toLowerCase());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
        "127.0.0.1", "127.1", "[::1]", "::1", "a@b.c", "host/path", "host.example/", "host.example?x", "host.example#x",
        "host.example.", ".host.example", "a..b", "-a.example", "a-.example", "ho st.example", "localhost",
        "host.example:", "host.example:0", "host.example:65536", "host.example:80:80", "host.example:http"})
    @DisplayName("Anything else is not")
    void invalid(String domain) {
        assertThat(FederationDomain.normalize(domain)).isEmpty();
    }

    @Test
    @DisplayName("A label of 63 characters is fine, one of 64 is not; neither is a name longer than 253")
    void lengths() {
        assertThat(FederationDomain.normalize("a".repeat(63) + ".example")).isPresent();
        assertThat(FederationDomain.normalize("a".repeat(64) + ".example")).isEmpty();
        assertThat(FederationDomain.normalize(("a".repeat(60) + ".").repeat(5) + "example")).isEmpty();
    }

    @Test
    @DisplayName("The host is the domain without its port")
    void host() {
        assertThat(FederationDomain.host("a.example:8080")).isEqualTo("a.example");
        assertThat(FederationDomain.host("a.example")).isEqualTo("a.example");
    }
}
