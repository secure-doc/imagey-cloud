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

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SigningKeyCipherTest {

    private static final byte[] PLAIN = "private key".getBytes(StandardCharsets.UTF_8);

    @Test
    @DisplayName("What is encrypted under a secret is decrypted under it, and the blob does not contain the plain text")
    void roundTrip() {
        byte[] blob = SigningKeyCipher.encrypt("secret", PLAIN);

        assertThat(SigningKeyCipher.decrypt("secret", blob)).hasValue(PLAIN);
        assertThat(new String(blob, StandardCharsets.ISO_8859_1)).doesNotContain("private key");
        assertThat(SigningKeyCipher.encrypt("secret", PLAIN)).isNotEqualTo(blob);
    }

    @Test
    @DisplayName("Another secret does not decrypt")
    void otherSecret() {
        assertThat(SigningKeyCipher.decrypt("other", SigningKeyCipher.encrypt("secret", PLAIN))).isEmpty();
    }

    @Test
    @DisplayName("A manipulated or truncated blob does not decrypt")
    void manipulated() {
        byte[] blob = SigningKeyCipher.encrypt("secret", PLAIN);
        blob[blob.length - 1] ^= 1;

        assertThat(SigningKeyCipher.decrypt("secret", blob)).isEmpty();
        assertThat(SigningKeyCipher.decrypt("secret", new byte[3])).isEmpty();
    }
}
