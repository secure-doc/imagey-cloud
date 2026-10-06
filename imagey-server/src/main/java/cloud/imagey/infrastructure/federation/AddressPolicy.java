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

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;

/**
 * Which addresses a federation request must never connect to (SSRF): everything that is not a
 * public unicast address. An IPv4-mapped IPv6 address is an {@link Inet4Address} to Java, so it is
 * judged by its IPv4 rules; the IPv4 address embedded in a NAT64 or 6to4 address is judged by them,
 * too, because a translator would connect to it.
 */
public final class AddressPolicy {

    private static final int BYTE_MASK = 0xFF;
    private static final int CGNAT_FIRST = 100;
    private static final int CGNAT_MASK = 0xC0;
    private static final int CGNAT_NETWORK = 0x40;
    private static final int BENCHMARK_FIRST = 198;
    private static final int BENCHMARK_MASK = 0xFE;
    private static final int BENCHMARK_NETWORK = 18;
    private static final int RESERVED_FIRST = 240;
    private static final int ULA_MASK = 0xFE;
    private static final int ULA_NETWORK = 0xFC;
    // documentation ranges (RFC 5737) and the IETF protocol assignments 192.0.0.0/24
    private static final int[][] V4_PREFIXES = {{192, 0, 0}, {192, 0, 2}, {198, 51, 100}, {203, 0, 113}};
    private static final int NAT64_FIRST = 0x64;
    private static final int NAT64_SECOND = 0xFF;
    private static final int NAT64_THIRD = 0x9B;
    private static final int SIXTO4_FIRST = 0x20;
    private static final int SIXTO4_SECOND = 0x02;
    private static final int DOC_SECOND = 0x01;
    private static final int DOC_THIRD = 0x0D;
    private static final int DOC_FOURTH = 0xB8;
    private static final int V6_EMBEDDED_NAT64 = 12;
    private static final int V6_EMBEDDED_6TO4 = 2;
    private static final int V4_LENGTH = 4;
    private static final int LOCAL_USE_FIFTH = 4;
    private static final int LOCAL_USE_SIXTH = 5;
    private static final int NAT64_ZERO_START = 4;
    private static final int NAT64_ZERO_END = 12;

    private AddressPolicy() {
    }

    public static boolean isForbidden(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isMulticastAddress()) {
            return true;
        }
        if (address.isLinkLocalAddress() || address.isSiteLocalAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (address instanceof Inet4Address) {
            return isForbiddenV4(octet(bytes, 0), octet(bytes, 1), octet(bytes, 2));
        }
        return address instanceof Inet6Address && isForbiddenV6(bytes);
    }

    private static boolean isForbiddenV6(byte[] bytes) {
        if ((bytes[0] & ULA_MASK) == ULA_NETWORK) {
            return true;
        }
        if (isDocumentationV6(bytes)) {
            return true;
        }
        if (isNat64LocalUse(bytes)) {
            return true;
        }
        if (isNat64(bytes) || isIpv4Compatible(bytes)) {
            return isEmbeddedForbidden(bytes, V6_EMBEDDED_NAT64);
        }
        return octet(bytes, 0) == SIXTO4_FIRST && octet(bytes, 1) == SIXTO4_SECOND && isEmbeddedForbidden(bytes, V6_EMBEDDED_6TO4);
    }

    // 2001:db8::/32
    private static boolean isDocumentationV6(byte[] bytes) {
        return octet(bytes, 0) == SIXTO4_FIRST && octet(bytes, 1) == DOC_SECOND
            && octet(bytes, 2) == DOC_THIRD && octet(bytes, 3) == DOC_FOURTH;
    }

    // 64:ff9b:1::/48 (RFC 8215) is meant for the translators of a network: the IPv4 address is not at a fixed place
    private static boolean isNat64LocalUse(byte[] bytes) {
        return octet(bytes, 0) == 0 && octet(bytes, 1) == NAT64_FIRST && octet(bytes, 2) == NAT64_SECOND
            && octet(bytes, 3) == NAT64_THIRD && octet(bytes, LOCAL_USE_FIFTH) == 0 && octet(bytes, LOCAL_USE_SIXTH) == 1;
    }

    // ::a.b.c.d (::/96, deprecated): the IPv4 address is in the last four bytes
    private static boolean isIpv4Compatible(byte[] bytes) {
        for (int i = 0; i < NAT64_ZERO_END; i++) {
            if (bytes[i] != 0) {
                return false;
            }
        }
        return true;
    }

    // 64:ff9b::/96 - the IPv4 address is in the last four bytes
    private static boolean isNat64(byte[] bytes) {
        if (octet(bytes, 0) != 0 || octet(bytes, 1) != NAT64_FIRST || octet(bytes, 2) != NAT64_SECOND || octet(bytes, 3) != NAT64_THIRD) {
            return false;
        }
        for (int i = NAT64_ZERO_START; i < NAT64_ZERO_END; i++) {
            if (bytes[i] != 0) {
                return false;
            }
        }
        return true;
    }

    private static boolean isEmbeddedForbidden(byte[] bytes, int offset) {
        try {
            return isForbidden(InetAddress.getByAddress(Arrays.copyOfRange(bytes, offset, offset + V4_LENGTH)));
        } catch (UnknownHostException e) {
            // only thrown for an address of an illegal length
            throw new IllegalStateException(e);
        }
    }

    private static int octet(byte[] bytes, int index) {
        return bytes[index] & BYTE_MASK;
    }

    private static boolean isForbiddenV4(int first, int second, int third) {
        if (first == 0 || first >= RESERVED_FIRST) {
            return true;
        }
        boolean carrierGrade = first == CGNAT_FIRST && (second & CGNAT_MASK) == CGNAT_NETWORK;
        boolean benchmark = first == BENCHMARK_FIRST && (second & BENCHMARK_MASK) == BENCHMARK_NETWORK;
        return carrierGrade || benchmark || isReservedPrefix(first, second, third);
    }

    private static boolean isReservedPrefix(int first, int second, int third) {
        for (int[] prefix : V4_PREFIXES) {
            if (prefix[0] == first && prefix[1] == second && prefix[2] == third) {
                return true;
            }
        }
        return false;
    }
}
