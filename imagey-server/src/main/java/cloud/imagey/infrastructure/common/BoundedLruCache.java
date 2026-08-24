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

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thread-safe, size-bounded LRU cache keyed by a triple {@code (K1, K2, K3)}. Backed by an
 * access-order {@link LinkedHashMap} with a hard entry cap (pure JDK); all operations are
 * serialized on the instance monitor.
 */
public class BoundedLruCache<K1, K2, K3, V> {

    private static final int INITIAL_CAPACITY = 16;
    private static final float LOAD_FACTOR = 0.75f;

    private final Map<List<Object>, V> entries;

    public BoundedLruCache(int maxEntries) {
        if (maxEntries < 1) {
            throw new IllegalArgumentException("maxEntries must be positive");
        }
        entries = Collections.synchronizedMap(new LinkedHashMap<>(INITIAL_CAPACITY, LOAD_FACTOR, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<List<Object>, V> eldest) {
                return size() > maxEntries;
            }
        });
    }

    public V get(K1 k1, K2 k2, K3 k3) {
        return entries.get(List.of(k1, k2, k3));
    }

    public void put(K1 k1, K2 k2, K3 k3, V value) {
        entries.put(List.of(k1, k2, k3), value);
    }
}
