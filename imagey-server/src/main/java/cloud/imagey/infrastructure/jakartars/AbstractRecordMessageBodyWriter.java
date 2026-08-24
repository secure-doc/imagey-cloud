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
package cloud.imagey.infrastructure.jakartars;

import java.io.IOException;
import java.io.StringReader;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.json.Json;
import jakarta.json.JsonException;
import jakarta.json.JsonNumber;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.json.bind.annotation.JsonbTypeDeserializer;
import jakarta.json.bind.annotation.JsonbTypeSerializer;

public abstract class AbstractRecordMessageBodyWriter {

    protected Object write(Object r) throws IOException {
        if (r == null) {
            return null;
        }
        if (!(r instanceof Record)) {
            return r;
        }
        RecordComponent[] recordComponents = r.getClass().getRecordComponents();
        if (recordComponents.length == 1) {
            Object component = read((Record)r, recordComponents[0]);
            // A single-String record whose type declares a custom JSON-B (de)serializer - e.g.
            // PublicKey - actually carries a JSON document in that String (this is the exact
            // inverse of AbstractRecordConverter, which stores an incoming object as
            // JsonbBuilder.toJson(map) on read). Emit it as parsed JSON so it nests as a
            // structured value instead of a quoted string.
            if (component instanceof String json && hasCustomJsonRepresentation(r.getClass())) {
                return parseJson(json);
            }
            return write(component);
        }
        Map<String, Object> values = new HashMap<>();
        for (RecordComponent component: recordComponents) {
            values.put(component.getName(), write(read((Record)r, component)));
        }
        return values;
    }

    protected <T> T read(Record r, RecordComponent component) {
        try {
            return (T)component.getAccessor().invoke(r);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean hasCustomJsonRepresentation(Class<?> type) {
        return type.isAnnotationPresent(JsonbTypeSerializer.class)
            || type.isAnnotationPresent(JsonbTypeDeserializer.class);
    }

    private static Object parseJson(String json) {
        try (JsonReader reader = Json.createReader(new StringReader(json))) {
            return toPlainJson(reader.readValue());
        } catch (JsonException e) {
            return json;
        }
    }

    private static Object toPlainJson(JsonValue value) {
        return switch (value.getValueType()) {
            case OBJECT -> {
                Map<String, Object> map = new LinkedHashMap<>();
                value.asJsonObject().forEach((key, element) -> map.put(key, toPlainJson(element)));
                yield map;
            }
            case ARRAY -> {
                List<Object> list = new ArrayList<>();
                value.asJsonArray().forEach(element -> list.add(toPlainJson(element)));
                yield list;
            }
            case STRING -> ((JsonString)value).getString();
            case NUMBER -> ((JsonNumber)value).numberValue();
            case TRUE -> Boolean.TRUE;
            case FALSE -> Boolean.FALSE;
            case NULL -> null;
        };
    }
}
