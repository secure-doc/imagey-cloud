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

import java.net.InetAddress;
import java.net.UnknownHostException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AddressPolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "127.0.0.1", "127.8.9.1", "::1", "0.0.0.0", "::", "0.1.2.3",
        "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
        "169.254.169.254", "fe80::1",
        "224.0.0.1", "ff02::1", "255.255.255.255", "240.0.0.1",
        "100.64.0.1", "100.127.255.255", "198.18.0.1", "198.19.255.255",
        "fc00::1", "fd12:3456::1",
        "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254",
        "192.0.0.8", "192.0.2.1", "198.51.100.7", "203.0.113.9", "2001:db8::1",
        "64:ff9b::7f00:1", "64:ff9b::a00:1", "64:ff9b::a9fe:a9fe",
        "2002:7f00:1::1", "64:ff9b:1::1", "64:ff9b:1:ffff::8.8.8.8", "::127.0.0.2", "::10.1.2.3", "2002:0a00:1::1", "2002:c0a8:101::1"})
    @DisplayName("An address that is not public is forbidden")
    void forbidden(String address) throws UnknownHostException {
        assertThat(AddressPolicy.isForbidden(InetAddress.getByName(address))).as(address).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1",
        "198.17.0.1", "198.20.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8",
        "::8.8.8.8", "192.0.1.1", "198.51.101.1", "64:ff9b::808:808", "2002:808:808::1"})
    @DisplayName("A public address is not")
    void allowed(String address) throws UnknownHostException {
        assertThat(AddressPolicy.isForbidden(InetAddress.getByName(address))).as(address).isFalse();
    }
}
