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
package cloud.imagey.domain.token;

import static java.util.Objects.requireNonNull;

import jakarta.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.infrastructure.record.AbstractSimpleRecordAdapter;

// Over the wire a Kid is a bare path segment (RecordParamConverterProvider) or a plain string field
// of a record handled by the reflective Record message body reader/writer. The adapter is only for
// JSON-B, which DocumentRepository uses to store an EncryptedSharedKey (kid included) on disk.
@JsonbTypeAdapter(Kid.Adapter.class)
public record Kid(String id) {
    public Kid {
        requireNonNull(id);
    }

    public static class Adapter extends AbstractSimpleRecordAdapter<Kid, String> {
    }
}
