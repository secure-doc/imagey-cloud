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

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.user.DomainName;

public class FederationSettingsTest {

    @Test
    @DisplayName("Federation is a switch, and off unless configured")
    void enabled() {
        assertThat(new FederationSettings(true).enabled()).isTrue();
        assertThat(new FederationSettings(false).enabled()).isFalse();
        assertThat(new FederationSettings().enabled()).isFalse();
    }

    @Test
    @DisplayName("The defaults are an hour for the key, a minute to half a minute for the caches and 30 new domains a minute")
    void defaults() {
        FederationSettings settings = new FederationSettings();

        assertThat(settings.keyMaxAge()).isEqualTo(Duration.ofHours(1));
        assertThat(settings.keyCacheCeiling()).isEqualTo(Duration.ofHours(1));
        assertThat(settings.keyCacheMin()).isEqualTo(Duration.ofMinutes(1));
        assertThat(settings.keyCacheNegative()).isEqualTo(Duration.ofSeconds(30));
        assertThat(settings.keyRefetchCooldown()).isEqualTo(Duration.ofMinutes(1));
        assertThat(settings.newDomainsPerMinute()).isEqualTo(30);
        assertThat(settings.ownDomains()).isEmpty();
    }

    @Test
    @DisplayName("The own domains are the hosts of the configured urls, with their port, in lower case")
    void ownDomains() {
        FederationSettings settings = new FederationSettings(true, List.of(
            new DomainName("https://Imagey.cloud"), new DomainName("https://www.imagey.cloud/"),
            new DomainName("http://localhost:8080"), new DomainName("https://imagey.cloud")));

        assertThat(settings.ownDomains()).containsExactlyInAnyOrder("imagey.cloud", "www.imagey.cloud", "localhost:8080");
    }
}
