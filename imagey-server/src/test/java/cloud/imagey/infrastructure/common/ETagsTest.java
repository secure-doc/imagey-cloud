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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

public class ETagsTest {

    @Test
    @DisplayName("normalize strips surrounding quotes and a weak prefix")
    void normalize() {
        assertThat(ETags.normalize("\"abc\"")).isEqualTo("abc");
        assertThat(ETags.normalize("W/\"abc\"")).isEqualTo("abc");
        assertThat(ETags.normalize("abc")).isEqualTo("abc");
        assertThat(ETags.normalize(null)).isNull();
    }

    @Test
    @DisplayName("normalize leaves an unbalanced or single-character token untouched")
    void normalizeEdgeCases() {
        assertThat(ETags.normalize("\"")).isEqualTo("\"");
        assertThat(ETags.normalize("\"abc")).isEqualTo("\"abc");
        assertThat(ETags.normalize("abc\"")).isEqualTo("abc\"");
        assertThat(ETags.normalize("\"\"")).isEmpty();
    }

    @Test
    @DisplayName("matches compares the normalized client tag against the raw current tag")
    void matches() {
        assertThat(ETags.matches("\"abc\"", "abc")).isTrue();
        assertThat(ETags.matches("W/\"abc\"", "abc")).isTrue();
        assertThat(ETags.matches("abc", "abc")).isTrue();
        assertThat(ETags.matches("\"abc\"", "def")).isFalse();
        assertThat(ETags.matches("\"abc\"", null)).isFalse();
        assertThat(ETags.matches(null, null)).isTrue();
    }
}
