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

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");
    private static final Duration MINUTE = Duration.ofMinutes(1);

    @Test
    @DisplayName("The requests over the limit in the window are refused, with the time until one is free again")
    void limits() {
        RateLimiter limiter = new RateLimiter(10);

        assertThat(limiter.tryAcquire("a", 2, MINUTE, NOW)).isEmpty();
        assertThat(limiter.tryAcquire("a", 2, MINUTE, NOW.plusSeconds(10))).isEmpty();
        assertThat(limiter.tryAcquire("a", 2, MINUTE, NOW.plusSeconds(20))).contains(Duration.ofSeconds(40));
    }

    @Test
    @DisplayName("The window slides: after a minute the first request no longer counts")
    void slides() {
        RateLimiter limiter = new RateLimiter(10);
        limiter.tryAcquire("a", 1, MINUTE, NOW);

        assertThat(limiter.tryAcquire("a", 1, MINUTE, NOW.plusSeconds(59))).isPresent();
        assertThat(limiter.tryAcquire("a", 1, MINUTE, NOW.plusSeconds(60))).isEmpty();
    }

    @Test
    @DisplayName("Every address has its own window")
    void perAddress() {
        RateLimiter limiter = new RateLimiter(10);
        limiter.tryAcquire("a", 1, MINUTE, NOW);

        assertThat(limiter.tryAcquire("b", 1, MINUTE, NOW)).isEmpty();
    }

    @Test
    @DisplayName("Only the most recently used addresses are remembered")
    void boundedKeys() {
        RateLimiter limiter = new RateLimiter(1);
        limiter.tryAcquire("a", 1, MINUTE, NOW);
        limiter.tryAcquire("b", 1, MINUTE, NOW);

        assertThat(limiter.tryAcquire("a", 1, MINUTE, NOW)).isEmpty();
    }
}
