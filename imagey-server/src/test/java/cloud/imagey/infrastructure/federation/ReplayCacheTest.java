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

import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReplayCacheTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

    @Test
    @DisplayName("An id is accepted once, and refused while it is remembered")
    void refusesReplay() {
        ReplayCache cache = new ReplayCache(10, 10);

        assertThat(cache.register("i", "a", NOW.plusSeconds(90), NOW)).isTrue();
        assertThat(cache.register("i", "a", NOW.plusSeconds(90), NOW.plusSeconds(10))).isFalse();
        assertThat(cache.register("i", "b", NOW.plusSeconds(90), NOW)).isTrue();
    }

    @Test
    @DisplayName("An expired id is forgotten")
    void forgetsExpired() {
        ReplayCache cache = new ReplayCache(10, 10);
        cache.register("i", "a", NOW.plusSeconds(90), NOW);

        assertThat(cache.register("i", "a", NOW.plusSeconds(300), NOW.plusSeconds(91))).isTrue();
    }

    @Test
    @DisplayName("A full cache refuses new ids instead of forgetting old ones, until something expires")
    void failsClosedWhenFull() {
        ReplayCache cache = new ReplayCache(2, 2);
        cache.register("i", "a", NOW.plusSeconds(90), NOW);
        cache.register("i", "b", NOW.plusSeconds(90), NOW);

        assertThat(cache.register("i", "c", NOW.plusSeconds(90), NOW)).isFalse();
        assertThat(cache.register("i", "a", NOW.plusSeconds(90), NOW)).isFalse();
        assertThat(cache.register("i", "c", NOW.plusSeconds(200), NOW.plusSeconds(100))).isTrue();
    }

    @Test
    @DisplayName("The same id of two issuers is two ids")
    void perIssuer() {
        ReplayCache cache = new ReplayCache(10, 10);

        assertThat(cache.register("a", "x", NOW.plusSeconds(90), NOW)).isTrue();
        assertThat(cache.register("b", "x", NOW.plusSeconds(90), NOW)).isTrue();
        assertThat(cache.register("a", "x", NOW.plusSeconds(90), NOW)).isFalse();
    }

    @Test
    @DisplayName("One issuer cannot fill the cache: the others still get in, and it is its share that frees up first")
    void issuerShare() {
        ReplayCache cache = new ReplayCache(10, 2);
        cache.register("evil", "1", NOW.plusSeconds(90), NOW);
        cache.register("evil", "2", NOW.plusSeconds(90), NOW);

        assertThat(cache.register("evil", "3", NOW.plusSeconds(90), NOW)).isFalse();
        assertThat(cache.register("good", "1", NOW.plusSeconds(90), NOW)).isTrue();
        assertThat(cache.register("evil", "3", NOW.plusSeconds(300), NOW.plusSeconds(100))).isTrue();
    }
}
