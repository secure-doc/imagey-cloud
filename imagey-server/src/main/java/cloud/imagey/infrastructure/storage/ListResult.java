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
package cloud.imagey.infrastructure.storage;

import java.util.List;

/**
 * The result of {@link BlobStore#list}: {@code keys} are full keys found directly under the listed prefix,
 * {@code commonPrefixes} are the prefixes one level deeper (each ending in the delimiter that was passed in).
 */
public record ListResult(List<String> keys, List<String> commonPrefixes) {
}
