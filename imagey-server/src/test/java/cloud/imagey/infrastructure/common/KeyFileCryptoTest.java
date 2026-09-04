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
package cloud.imagey.infrastructure.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class KeyFileCryptoTest {

    private static final String SECRET = "test-keyfile-pepper";
    private static final String D1 = "31e3569a-d2a7-493d-8d45-06370ebd2705";
    private static final String D2 = "d8a54c36-a42e-4f8c-bbaa-ceab5821c88c";
    private static final String F = "a358c2ed-07d4-4a25-a7db-d860d5c0b895";
    private static final String G = "0";

    private final KeyFileCrypto crypto = crypto(SECRET);

    @Test
    @DisplayName("fileName is deterministic for the same (documentId, kid) and secret")
    void fileNameDeterministic() {
        assertThat(crypto.fileName(D1, F)).isEqualTo(crypto(SECRET).fileName(D1, F));
        assertThat(crypto.fileName(D1, F)).endsWith(".json");
    }

    @Test
    @DisplayName("fileName is a function of both endpoints - it does not collide with documents/{kid}/")
    void fileNameEdgeUnique() {
        assertThat(crypto.fileName(D1, F)).isNotEqualTo(crypto.fileName(D2, F));
        assertThat(crypto.fileName(D1, F)).isNotEqualTo(crypto.fileName(D1, G));
        // the parent directory name is documents/{F}/ - the child's key file must not be named after it
        assertThat(crypto.fileName(D1, F)).doesNotContain(F);
    }

    @Test
    @DisplayName("a different secret yields a different fileName (sub-keys depend on the secret)")
    void fileNameSecretSensitive() {
        assertThat(crypto.fileName(D1, F)).isNotEqualTo(crypto("another-pepper").fileName(D1, F));
    }

    @Test
    @DisplayName("witness varies with the salt for the same (issuer, kid)")
    void witnessSaltDependent() {
        byte[] saltA = crypto.deterministicSalt(D1, F);
        byte[] saltB = crypto.randomSalt();
        assertThat(crypto.witness(saltA, F, F)).isNotEqualTo(crypto.witness(saltB, F, F));
    }

    @Test
    @DisplayName("witness is deterministic and depends on issuer and kid")
    void witnessDeterministic() {
        byte[] salt = crypto.deterministicSalt(D1, F);
        assertThat(crypto.witness(salt, F, F)).isEqualTo(crypto.witness(salt, F, F));
        assertThat(crypto.witness(salt, F, F)).isNotEqualTo(crypto.witness(salt, D1, F));
        assertThat(crypto.witness(salt, F, F)).isNotEqualTo(crypto.witness(salt, F, D1));
    }

    @Test
    @DisplayName("witnessMatches accepts the matching triple and rejects any mismatch or malformed input")
    void witnessMatches() {
        byte[] salt = crypto.randomSalt();
        String stored = crypto.witness(salt, F, D1);

        assertThat(crypto.witnessMatches(stored, salt, F, D1)).isTrue();
        assertThat(crypto.witnessMatches(stored, salt, D1, F)).isFalse();
        assertThat(crypto.witnessMatches(stored, crypto.randomSalt(), F, D1)).isFalse();
        assertThat(crypto.witnessMatches("not base64!!", salt, F, D1)).isFalse();
        assertThat(crypto.witnessMatches("", salt, F, D1)).isFalse();
    }

    @Test
    @DisplayName("deterministicSalt is 16 bytes, reproducible, and edge-unique")
    void deterministicSalt() {
        assertThat(crypto.deterministicSalt(D1, F)).hasSize(16).isEqualTo(crypto.deterministicSalt(D1, F));
        assertThat(crypto.deterministicSalt(D1, F)).isNotEqualTo(crypto.deterministicSalt(D2, F));
    }

    @Test
    @DisplayName("startup fails fast when document.mapping.secret is unset")
    void missingSecretFailsStartup() {
        KeyFileCrypto uninitialised = new KeyFileCrypto();
        assertThatThrownBy(() -> invokeInit(uninitialised)).isInstanceOf(NullPointerException.class);
    }

    private static KeyFileCrypto crypto(String secret) {
        KeyFileCrypto instance = new KeyFileCrypto();
        setField(instance, "secret", secret);
        invokeInit(instance);
        return instance;
    }

    private static void invokeInit(KeyFileCrypto instance) {
        try {
            var init = KeyFileCrypto.class.getDeclaredMethod("init");
            init.setAccessible(true);
            init.invoke(instance);
        } catch (ReflectiveOperationException e) {
            if (e.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new IllegalStateException(e);
        }
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
