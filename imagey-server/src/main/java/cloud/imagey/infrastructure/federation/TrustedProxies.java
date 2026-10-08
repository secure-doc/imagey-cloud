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

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The reverse proxies whose {@code X-Forwarded-For} may be believed: loopback, and the addresses or
 * CIDR ranges configured ({@code federation.trusted-proxies}) - nginx in another container reaches
 * the server from the bridge network, not from loopback. Only IP literals are ever resolved.
 */
public final class TrustedProxies {

    private static final Pattern LITERAL = Pattern.compile("[0-9a-fA-F:.]+");
    private static final int BYTE = 8;
    private static final int HIGH_BIT = 0x80;

    private final List<Range> ranges;

    public TrustedProxies(List<String> configured) {
        ranges = configured.stream().map(String::trim).filter(entry -> !entry.isEmpty()).map(TrustedProxies::range).toList();
    }

    /** The address as an IP literal, or empty for anything else (a host name, garbage). */
    public static Optional<InetAddress> parse(String address) {
        if (address == null || !LITERAL.matcher(address.trim()).matches()) {
            return Optional.empty();
        }
        try {
            return Optional.of(InetAddress.getByName(address.trim()));
        } catch (UnknownHostException e) {
            return Optional.empty();
        }
    }

    public boolean trusts(String address) {
        return parse(address).map(ip -> ip.isLoopbackAddress() || ranges.stream().anyMatch(range -> range.contains(ip))).orElse(false);
    }

    private static Range range(String entry) {
        int slash = entry.indexOf('/');
        String host = slash < 0 ? entry : entry.substring(0, slash);
        InetAddress network = parse(host).orElseThrow(() -> new IllegalArgumentException("Not an address: " + entry));
        int bits = slash < 0 ? network.getAddress().length * BYTE : Integer.parseInt(entry.substring(slash + 1));
        if (bits < 0 || bits > network.getAddress().length * BYTE) {
            throw new IllegalArgumentException("Invalid prefix length: " + entry);
        }
        return new Range(network.getAddress(), bits);
    }

    private record Range(byte[] network, int bits) {
        boolean contains(InetAddress address) {
            byte[] bytes = address.getAddress();
            if (bytes.length != network.length) {
                return false;
            }
            for (int i = 0; i < bits; i++) {
                int mask = HIGH_BIT >> (i % BYTE);
                if ((bytes[i / BYTE] & mask) != (network[i / BYTE] & mask)) {
                    return false;
                }
            }
            return true;
        }
    }
}
