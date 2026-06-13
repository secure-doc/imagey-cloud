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

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class DomainNameTest {

    @Test
    void testConstructorTrailingSlashStripping() {
        DomainName domain = new DomainName("https://secure-doc.store/");
        assertEquals("https://secure-doc.store", domain.value());
        assertEquals("secure-doc.store", domain.getHost());
    }

    @Test
    void testGetAppNameWhitelabel() {
        DomainName domain = new DomainName("secure-doc.store");
        assertEquals("Secure Doc", domain.getAppName());
    }

    @Test
    void testGetAppNameDefault() {
        DomainName domain = new DomainName("imagey.cloud");
        assertEquals("Imagey", domain.getAppName());
    }

    @Test
    void testGetAppNameNull() {
        DomainName domain = new DomainName(null);
        assertEquals("Imagey", domain.getAppName());
    }

    @Test
    void testGetHostHttpsStripping() {
        DomainName domain = new DomainName("https://secure-doc.store");
        assertEquals("secure-doc.store", domain.getHost());
    }

    @Test
    void testGetHostHttpStripping() {
        DomainName domain = new DomainName("http://imagey.cloud");
        assertEquals("imagey.cloud", domain.getHost());
    }

    @Test
    void testGetHostPortStripping() {
        DomainName domain = new DomainName("localhost:8080");
        assertEquals("localhost", domain.getHost());
    }

    @Test
    void testGetHostHttpsAndPortStripping() {
        DomainName domain = new DomainName("https://secure-doc.store:8443");
        assertEquals("secure-doc.store", domain.getHost());
    }

    @Test
    void testGetHostPlain() {
        DomainName domain = new DomainName("secure-doc.cloud");
        assertEquals("secure-doc.cloud", domain.getHost());
    }

    @Test
    void testGetHostNullFallback() {
        DomainName domain = new DomainName(null);
        assertEquals("imagey.cloud", domain.getHost());
    }
}
