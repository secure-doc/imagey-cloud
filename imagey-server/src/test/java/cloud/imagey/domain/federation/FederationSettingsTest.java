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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

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
        assertThat(settings.guestSessionTtl()).isEqualTo(Duration.ofMinutes(15));
        assertThat(settings.ownDomains()).isEmpty();
    }

    @Test
    @DisplayName("The lifetime of a guest token can be configured as an ISO-8601 duration (the end-to-end test uses 20 seconds)")
    void guestSessionTtl() throws ReflectiveOperationException {
        FederationSettings settings = withTtl("PT20S");

        assertThat(settings.guestSessionTtl()).isEqualTo(Duration.ofSeconds(20));
    }

    @ParameterizedTest
    @ValueSource(strings = {"15m", "", "PT0S", "-PT5M"})
    @DisplayName("A lifetime that is no positive ISO-8601 duration stops the server at startup")
    void invalidGuestSessionTtl(String value) {
        assertThatThrownBy(() -> withTtl(value)).isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("federation.guest-session.ttl");
    }

    @Test
    @DisplayName("The start of the application validates the lifetime")
    void validatedAtStartup() throws ReflectiveOperationException {
        FederationSettings settings = new FederationSettings();
        java.lang.reflect.Field field = FederationSettings.class.getDeclaredField("guestSessionTtl");
        field.setAccessible(true);
        field.set(settings, "PT0S");

        assertThatThrownBy(() -> settings.onStartup(new Object())).isInstanceOf(IllegalStateException.class);
    }

    private static FederationSettings withTtl(String ttl) throws ReflectiveOperationException {
        FederationSettings settings = new FederationSettings();
        java.lang.reflect.Field field = FederationSettings.class.getDeclaredField("guestSessionTtl");
        field.setAccessible(true);
        field.set(settings, ttl);
        settings.validate();
        return settings;
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
