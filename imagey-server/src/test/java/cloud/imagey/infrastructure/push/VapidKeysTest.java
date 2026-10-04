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
package cloud.imagey.infrastructure.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.infrastructure.common.Base64Url;

class VapidKeysTest {

    private static final String SUBJECT = "mailto:admin@imagey.cloud";

    @Test
    @DisplayName("Disabled when either key is unset")
    void disabledWithoutBothKeys() {
        assertThat(keys(Optional.empty(), Optional.empty()).isEnabled()).isFalse();
        assertThat(keys(Optional.of("only-public"), Optional.empty()).isEnabled()).isFalse();
        assertThat(keys(Optional.empty(), Optional.of("only-private")).isEnabled()).isFalse();
    }

    @Test
    @DisplayName("Disabled, with a warning, when the configured keys are not valid base64url or not a valid point")
    void disabledOnInvalidKeys() {
        assertThat(keys(Optional.of("not base64!!"), Optional.of("not base64!!")).isEnabled()).isFalse();
        assertThat(keys(Optional.of("AAAA"), Optional.of("AAAA")).isEnabled()).isFalse();
    }

    @Test
    @DisplayName("Enabled with a matching key pair, and exposes the raw public key and configured subject")
    void enabledWithValidKeyPair() throws Exception {
        KeyPair pair = EcKeys.generate();
        String publicKeyB64 = Base64Url.encode(EcKeys.encodePoint((ECPublicKey) pair.getPublic()));
        String privateKeyB64 = Base64Url.encode(((ECPrivateKey) pair.getPrivate()).getS().toByteArray());

        VapidKeys keys = keys(Optional.of(publicKeyB64), Optional.of(privateKeyB64));

        assertThat(keys.isEnabled()).isTrue();
        assertThat(keys.publicKeyBase64Url()).isEqualTo(publicKeyB64);
        assertThat(keys.subject()).isEqualTo(SUBJECT);
        assertThat(keys.publicKey()).isNotNull();
        assertThat(keys.privateKey()).isNotNull();
    }

    private static VapidKeys keys(Optional<String> publicKey, Optional<String> privateKey) {
        VapidKeys instance = new VapidKeys();
        setField(instance, "publicKeyConfig", publicKey);
        setField(instance, "privateKeyConfig", privateKey);
        setField(instance, "subject", SUBJECT);
        invokeInit(instance);
        return instance;
    }

    private static void invokeInit(VapidKeys instance) {
        try {
            Method init = VapidKeys.class.getDeclaredMethod("init");
            init.setAccessible(true);
            init.invoke(instance);
        } catch (ReflectiveOperationException e) {
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
