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

public record DomainName(String value) {
    private static final int HTTPS_LENGTH = 8;
    private static final int HTTP_LENGTH = 7;

    public DomainName {
        if (value != null && value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
    }



    public String getAppName() {
        if (value != null && value.contains("secure-doc")) {
            return "Secure Doc";
        }
        return "Imagey";
    }

    public String getHost() {
        if (value == null) {
            return "imagey.cloud";
        }
        String host = value;
        if (host.startsWith("https://")) {
            host = host.substring(HTTPS_LENGTH);
        }
        if (host.startsWith("http://")) {
            host = host.substring(HTTP_LENGTH);
        }
        if (host.contains(":")) {
            host = host.substring(0, host.indexOf(":"));
        }
        return host;
    }
}
