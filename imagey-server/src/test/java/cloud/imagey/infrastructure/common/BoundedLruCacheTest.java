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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

public class BoundedLruCacheTest {

    private final BoundedLruCache<String, String, String, Integer> cache = new BoundedLruCache<>(3);

    @Test
    @DisplayName("stores and retrieves a value by its triple key")
    void storesAndRetrieves() {
        cache.put("owner", "doc", "member", 1);

        assertThat(cache.get("owner", "doc", "member")).isEqualTo(1);
        assertThat(cache.get("owner", "doc", "other")).isNull();
    }

    @Test
    @DisplayName("evicts the least recently used entry once the cap is exceeded")
    void evictsLeastRecentlyUsed() {
        cache.put("o", "a", "m", 1);
        cache.put("o", "b", "m", 2);
        cache.put("o", "c", "m", 3);

        cache.get("o", "a", "m"); // touch "a" so "b" becomes the eldest
        cache.put("o", "d", "m", 4); // over the cap -> evicts "b"

        assertThat(cache.get("o", "b", "m")).isNull();
        assertThat(cache.get("o", "a", "m")).isEqualTo(1);
        assertThat(cache.get("o", "c", "m")).isEqualTo(3);
        assertThat(cache.get("o", "d", "m")).isEqualTo(4);
    }

    @Test
    @DisplayName("re-putting a key updates the value without growing the cache")
    void rePutDoesNotEvict() {
        cache.put("o", "a", "m", 1);
        cache.put("o", "b", "m", 2);
        cache.put("o", "c", "m", 3);

        cache.put("o", "a", "m", 11);

        assertThat(cache.get("o", "a", "m")).isEqualTo(11);
        assertThat(cache.get("o", "b", "m")).isEqualTo(2);
        assertThat(cache.get("o", "c", "m")).isEqualTo(3);
    }

    @Test
    @DisplayName("a non-positive capacity is rejected")
    void rejectsNonPositiveCapacity() {
        assertThatThrownBy(() -> new BoundedLruCache<>(0)).isInstanceOf(IllegalArgumentException.class);
    }
}
