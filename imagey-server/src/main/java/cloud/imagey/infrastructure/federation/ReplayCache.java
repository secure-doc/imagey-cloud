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

import java.time.Instant;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Remembers the {@code jti} of redeemed assertions until they expire, so that one cannot be used
 * twice. The ids are kept per issuer, and one issuer may hold only a share of the cache: a server
 * that is signed correctly but malicious could otherwise fill it with assertions that are refused
 * afterwards, and lock out the users of every other server. Per instance: several instances would need a shared cache (like the challenges of ADR 0014,
 * which are kept in memory, too - this server runs as one instance).
 *
 * <p>Fails closed: when the cache is full and nothing has expired, it refuses new entries rather than
 * forgetting old ones, because a forgotten entry is a replayable assertion.
 */
public class ReplayCache {

    private final int capacity;
    private final int perIssuer;
    private final Map<String, Instant> entries = new LinkedHashMap<>();
    private final Map<String, Integer> counts = new HashMap<>();

    public ReplayCache(int capacity, int perIssuer) {
        this.capacity = capacity;
        this.perIssuer = perIssuer;
    }

    /**
     * Remembers {@code jti} of {@code issuer} until {@code expires}; {@code false} if it is known already
     * or the cache (or the share of this issuer) is full.
     */
    public synchronized boolean register(String issuer, String jti, Instant expires, Instant now) {
        String key = issuer + "\n" + jti;
        if (entries.size() >= capacity || counts.getOrDefault(issuer, 0) >= perIssuer || entries.containsKey(key)) {
            purge(now);
        }
        if (entries.containsKey(key) || entries.size() >= capacity || counts.getOrDefault(issuer, 0) >= perIssuer) {
            return false;
        }
        entries.put(key, expires);
        counts.merge(issuer, 1, Integer::sum);
        return true;
    }

    private void purge(Instant now) {
        Iterator<Map.Entry<String, Instant>> expiries = entries.entrySet().iterator();
        while (expiries.hasNext()) {
            Map.Entry<String, Instant> entry = expiries.next();
            if (!now.isBefore(entry.getValue())) {
                expiries.remove();
                String issuer = entry.getKey().substring(0, entry.getKey().indexOf('\n'));
                counts.computeIfPresent(issuer, (k, n) -> n > 1 ? n - 1 : null);
            }
        }
    }
}
