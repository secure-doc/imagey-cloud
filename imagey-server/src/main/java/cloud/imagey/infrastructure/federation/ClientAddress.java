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

import java.net.Inet6Address;
import java.net.InetAddress;
import java.util.HexFormat;
import java.util.Optional;

/**
 * The client of a request, as the key of a rate limit. When the connection comes from a
 * {@link TrustedProxies trusted proxy}, the client is the last entry of {@code X-Forwarded-For} that
 * is not a proxy itself; from anywhere else the header comes from the client and is never believed.
 * An IPv6 client is represented by its /64 network: a single user owns a whole one, so every address
 * of it would be a free new key.
 */
public final class ClientAddress {

    private static final int IPV6_NETWORK_BYTES = 8;

    private ClientAddress() {
    }

    public static String of(String remoteAddr, String forwardedFor, TrustedProxies proxies) {
        String client = remoteAddr;
        if (forwardedFor != null && proxies.trusts(remoteAddr)) {
            String[] entries = forwardedFor.split(",");
            client = entries[0].trim();
            for (int i = entries.length - 1; i >= 0; i--) {
                String entry = entries[i].trim();
                if (!proxies.trusts(entry)) {
                    client = entry;
                    break;
                }
            }
        }
        return key(client == null || client.isBlank() ? remoteAddr : client);
    }

    private static String key(String address) {
        Optional<InetAddress> ip = TrustedProxies.parse(address);
        if (ip.isEmpty()) {
            return address == null || address.isBlank() ? "unknown" : address.trim();
        }
        if (ip.get() instanceof Inet6Address) {
            return HexFormat.of().formatHex(ip.get().getAddress(), 0, IPV6_NETWORK_BYTES) + "::/64";
        }
        return ip.get().getHostAddress();
    }
}
