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
package cloud.imagey.domain.user;

import jakarta.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.domain.user.DeviceId.Adapter;
import cloud.imagey.infrastructure.record.AbstractSimpleRecordAdapter;

@JsonbTypeAdapter(Adapter.class)
public record DeviceId(String id) {
    public static class Adapter extends AbstractSimpleRecordAdapter<DeviceId, String> {
    }
}
