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

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** A sliding-window limit per key (a client address), for at most {@code maxKeys} keys (least recently used first out). */
public class RateLimiter {

    private static final int INITIAL_CAPACITY = 16;
    private static final float LOAD_FACTOR = 0.75f;

    private final Map<String, Deque<Instant>> windows;

    public RateLimiter(int maxKeys) {
        windows = Collections.synchronizedMap(new LinkedHashMap<>(INITIAL_CAPACITY, LOAD_FACTOR, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Deque<Instant>> eldest) {
                return size() > maxKeys;
            }
        });
    }

    /**
     * Counts a request of {@code key}.
     *
     * @return empty if it is allowed, otherwise the time to wait until the oldest request leaves the window
     */
    public Optional<Duration> tryAcquire(String key, int limit, Duration window, Instant now) {
        Deque<Instant> requests;
        synchronized (windows) {
            requests = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        }
        synchronized (requests) {
            while (!requests.isEmpty() && !now.isBefore(requests.peekFirst().plus(window))) {
                requests.pollFirst();
            }
            if (requests.size() >= limit) {
                return Optional.of(Duration.between(now, requests.peekFirst().plus(window)));
            }
            requests.addLast(now);
            return Optional.empty();
        }
    }
}
