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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClientAddressTest {

    private static final TrustedProxies LOOPBACK = new TrustedProxies(List.of());
    private static final TrustedProxies BRIDGE = new TrustedProxies(List.of("172.16.0.0/12", "fd00::/8"));

    @Test
    @DisplayName("Behind the proxy on the same host the last X-Forwarded-For entry is the client")
    void behindLoopback() {
        assertThat(ClientAddress.of("127.0.0.1", "6.6.6.6, 203.0.113.7", LOOPBACK)).isEqualTo("203.0.113.7");
        assertThat(ClientAddress.of("::1", "203.0.113.7", LOOPBACK)).isEqualTo("203.0.113.7");
    }

    @Test
    @DisplayName("A configured proxy network is trusted as well, and proxies at the end of the chain are skipped")
    void configuredProxies() {
        assertThat(ClientAddress.of("172.17.0.1", "6.6.6.6, 203.0.113.7", BRIDGE)).isEqualTo("203.0.113.7");
        assertThat(ClientAddress.of("172.17.0.1", "203.0.113.7, 172.18.0.5", BRIDGE)).isEqualTo("203.0.113.7");
        assertThat(ClientAddress.of("172.17.0.1", "172.18.0.5", BRIDGE)).isEqualTo("172.18.0.5");
        assertThat(ClientAddress.of("172.17.0.1", "203.0.113.7", LOOPBACK)).isEqualTo("172.17.0.1");
    }

    @Test
    @DisplayName("A header from a client that is not a proxy is never trusted")
    void ignoresHeaderFromOutside() {
        assertThat(ClientAddress.of("198.51.100.4", "203.0.113.7", BRIDGE)).isEqualTo("198.51.100.4");
    }

    @Test
    @DisplayName("An IPv6 client is its /64 network: the addresses of one network are one client")
    void ipv6Network() {
        String first = ClientAddress.of("2001:db8:1:2:aaaa:bbbb:cccc:1", null, LOOPBACK);

        assertThat(first).isEqualTo("20010db800010002::/64");
        assertThat(ClientAddress.of("2001:db8:1:2::ffff", null, LOOPBACK)).isEqualTo(first);
        assertThat(ClientAddress.of("2001:db8:1:3::1", null, LOOPBACK)).isNotEqualTo(first);
        assertThat(ClientAddress.of("::1", "2001:db8:1:2::9", LOOPBACK)).isEqualTo(first);
    }

    @Test
    @DisplayName("Without a usable header the connection address counts")
    void fallsBack() {
        assertThat(ClientAddress.of("127.0.0.1", null, LOOPBACK)).isEqualTo("127.0.0.1");
        assertThat(ClientAddress.of("127.0.0.1", " , ", LOOPBACK)).isEqualTo("127.0.0.1");
        assertThat(ClientAddress.of("127.0.0.1", "not-an-ip", LOOPBACK)).isEqualTo("not-an-ip");
        assertThat(ClientAddress.of(null, null, LOOPBACK)).isEqualTo("unknown");
    }

    @Test
    @DisplayName("A proxy entry must be an address or a CIDR range")
    void invalidConfiguration() {
        assertThatThrownBy(() -> new TrustedProxies(List.of("proxy.example"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TrustedProxies(List.of("10.0.0.0/40"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(new TrustedProxies(List.of("10.0.0.1", " ")).trusts("10.0.0.1")).isTrue();
        assertThat(new TrustedProxies(List.of("10.0.0.1")).trusts("10.0.0.2")).isFalse();
    }
}
