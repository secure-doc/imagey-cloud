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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.util.Optional;

import jakarta.ws.rs.NotFoundException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.infrastructure.push.VapidKeys;

// Exercised directly (no Meecrowave/HTTP round trip needed - @PermitAll means there is no
// authorization behaviour to cover, unlike the session-bound endpoints tested via HTTP elsewhere).
class PushResourceTest {

    @Test
    @DisplayName("404 when push is disabled (no VAPID keys configured, ADR 0020: never a startup failure)")
    void notFoundWhenDisabled() {
        PushResource resource = resource(new VapidKeys());

        assertThatThrownBy(resource::vapidPublicKey).isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("Returns the raw configured public key when push is enabled")
    void returnsTheKeyWhenEnabled() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();
        VapidKeys keys = new VapidKeys();
        setField(keys, "publicKeyConfig", Optional.of("the-public-key"));
        setField(keys, "publicKey", pair.getPublic());
        setField(keys, "privateKey", pair.getPrivate());

        assertThat(resource(keys).vapidPublicKey()).isEqualTo("the-public-key");
    }

    private static PushResource resource(VapidKeys keys) {
        PushResource resource = new PushResource();
        setField(resource, "vapidKeys", keys);
        return resource;
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
