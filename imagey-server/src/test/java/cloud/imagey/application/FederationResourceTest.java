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
package cloud.imagey.application;

import static jakarta.ws.rs.client.ClientBuilder.newClient;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;

import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.Response;

import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;

import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
public class FederationResourceTest {

    private static final String KEY = "/users/federation/key";

    @ConfigurationInject
    private static Meecrowave.Builder config;

    @Test
    @DisplayName("The key is public: a key set with one public P-256 key, and no private part")
    void publishesTheKey() throws Exception {
        Response response = get();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getMediaType().toString()).isEqualTo("application/jwk-set+json");
        assertThat(response.getHeaderString("Cache-Control")).contains("max-age=3600");
        assertThat(response.getHeaderString("X-Content-Type-Options")).isEqualTo("nosniff");
        String body = response.readEntity(String.class);
        assertThat(body).doesNotContain("\"d\"");
        JWKSet set = JWKSet.parse(body);
        assertThat(set.getKeys()).hasSize(1);
        ECKey key = set.getKeys().get(0).toECKey();
        assertThat(key.isPrivate()).isFalse();
        assertThat(key.getCurve().getName()).isEqualTo("P-256");
        assertThat(key.getKeyID()).isEqualTo(key.computeThumbprint().toString());
    }

    @Test
    @DisplayName("Asked twice, the server has the same key")
    void stableKey() throws Exception {
        String first = JWKSet.parse(get().readEntity(String.class)).getKeys().get(0).getKeyID();
        String second = JWKSet.parse(get().readEntity(String.class)).getKeys().get(0).getKeyID();

        assertThat(first).isEqualTo(second);
    }

    @Test
    @DisplayName("Other methods than GET and HEAD are not allowed")
    void methods() {
        assertThat(newClient().target(url()).request().post(Entity.text("x")).getStatus()).isEqualTo(405);
        assertThat(newClient().target(url()).request().head().getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("There is no key to read while federation is off")
    void notFoundWhenDisabled() throws Exception {
        FederationResource resource = new FederationResource();
        Field settings = FederationResource.class.getDeclaredField("settings");
        settings.setAccessible(true);
        settings.set(resource, new FederationSettings(false));

        assertThatThrownBy(resource::key).isInstanceOf(NotFoundException.class);
    }

    private static Response get() {
        return newClient().target(url()).request().get();
    }

    private static String url() {
        return "http://localhost:" + config.getHttpPort() + KEY;
    }
}
