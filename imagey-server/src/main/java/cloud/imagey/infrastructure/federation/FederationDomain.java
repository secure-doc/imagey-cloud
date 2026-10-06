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

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Validation of the server domain ({@code host[:port]}) a user or an assertion names. It runs before
 * any network access, so that only syntactically plain DNS names ever reach the resolver: no IP
 * literal, no user info, no path, query or fragment.
 */
public final class FederationDomain {

    private static final int MAX_LENGTH = 253;
    private static final int MAX_LABEL_LENGTH = 63;
    private static final int MAX_PORT = 65535;
    private static final Pattern LABEL = Pattern.compile("[a-z0-9]([a-z0-9-]*[a-z0-9])?");
    private static final Pattern NUMERIC = Pattern.compile("[0-9]+");
    private static final Pattern PORT = Pattern.compile("[0-9]{1,5}");

    private FederationDomain() {
    }

    /** The lower-cased domain, or empty if {@code domain} is not a plain {@code host[:port]}. */
    public static Optional<String> normalize(String domain) {
        if (domain == null) {
            return Optional.empty();
        }
        String value = domain.toLowerCase(Locale.ROOT);
        int colon = value.indexOf(':');
        String host = colon < 0 ? value : value.substring(0, colon);
        if (colon >= 0 && !isPort(value.substring(colon + 1))) {
            return Optional.empty();
        }
        return isHost(host) ? Optional.of(value) : Optional.empty();
    }

    /** The host of a normalized domain, without the port. */
    public static String host(String domain) {
        int colon = domain.indexOf(':');
        return colon < 0 ? domain : domain.substring(0, colon);
    }

    private static boolean isPort(String port) {
        return PORT.matcher(port).matches() && Integer.parseInt(port) >= 1 && Integer.parseInt(port) <= MAX_PORT;
    }

    private static boolean isHost(String host) {
        if (host.isEmpty() || host.length() > MAX_LENGTH || !host.contains(".")) {
            return false;
        }
        String[] labels = host.split("\\.", -1);
        for (String label : labels) {
            if (label.length() > MAX_LABEL_LENGTH || !LABEL.matcher(label).matches()) {
                return false;
            }
        }
        // 127.1 and the like are IP addresses in disguise, not names
        return !NUMERIC.matcher(labels[labels.length - 1]).matches();
    }
}
