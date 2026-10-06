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
package cloud.imagey.domain.contact;

import static java.time.ZoneOffset.UTC;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

import jakarta.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.domain.contact.MessageTimestamp.Adapter;
import cloud.imagey.infrastructure.record.AbstractSimpleRecordAdapter;

/**
 * When the server accepted a message (ADR 0021): an ISO-8601 instant in UTC with fixed millisecond precision, e.g.
 * {@code 2026-10-06T14:03:12.481Z}.
 */
@JsonbTypeAdapter(Adapter.class)
public record MessageTimestamp(String value) {

    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(UTC);

    public MessageTimestamp(Instant instant) {
        this(FORMAT.format(instant.truncatedTo(ChronoUnit.MILLIS)));
    }

    public Instant instant() {
        return Instant.parse(value);
    }

    public static class Adapter extends AbstractSimpleRecordAdapter<MessageTimestamp, String> { }
}
