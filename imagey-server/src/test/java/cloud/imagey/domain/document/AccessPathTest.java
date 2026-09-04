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
package cloud.imagey.domain.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import jakarta.validation.ValidationException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AccessPathTest {

    private static String encode(String json) {
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("null / blank header -> null (no header sent)")
    void absent() {
        assertThat(AccessPath.parse(null)).isNull();
        assertThat(AccessPath.parse("   ")).isNull();
    }

    @Test
    @DisplayName("a well-formed chain parses into hops")
    void wellFormed() {
        AccessPath path = AccessPath.parse(encode(
            "{\"chain\":[{\"doc\":\"D\",\"owner\":\"O\",\"wrappedBy\":\"F\"},"
            + "{\"doc\":\"F\",\"owner\":\"O\",\"wrappedBy\":\"F\"}]}"));

        assertThat(path.hops()).hasSize(2);
        assertThat(path.hops().get(0).doc()).isEqualTo(new DocumentId("D"));
        assertThat(path.hops().get(0).owner().id().id()).isEqualTo("O");
        assertThat(path.hops().get(1).wrappedBy()).isEqualTo(new DocumentId("F"));
    }

    @Test
    @DisplayName("not base64url -> ValidationException")
    void badBase64() {
        assertThatThrownBy(() -> AccessPath.parse("not base64url!!"))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("not JSON / not a chain document -> ValidationException")
    void badJson() {
        assertThatThrownBy(() -> AccessPath.parse(encode("not json")))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AccessPath.parse(encode("{\"nope\":1}")))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AccessPath.parse(encode("{\"chain\":[]}")))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AccessPath.parse(encode("{\"chain\":{}}")))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AccessPath.parse(encode("{\"chain\":[{\"doc\":\"D\",\"owner\":\"O\"}]}")))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AccessPath.parse(encode("{\"chain\":[{\"doc\":1,\"owner\":\"O\",\"wrappedBy\":\"F\"}]}")))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("more than MAX_HOPS entries -> ValidationException")
    void oversize() {
        StringBuilder chain = new StringBuilder("{\"chain\":[");
        for (int i = 0; i <= AccessPath.MAX_HOPS; i++) {
            chain.append(i == 0 ? "" : ",")
                .append("{\"doc\":\"d").append(i).append("\",\"owner\":\"o\",\"wrappedBy\":\"w\"}");
        }
        chain.append("]}");

        assertThatThrownBy(() -> AccessPath.parse(encode(chain.toString())))
            .isInstanceOf(ValidationException.class);
    }
}
