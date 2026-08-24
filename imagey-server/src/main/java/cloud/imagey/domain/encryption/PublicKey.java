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
package cloud.imagey.domain.encryption;

import static jakarta.json.Json.createReader;

import java.io.StringReader;
import java.lang.reflect.Type;

import jakarta.json.JsonReader;
import jakarta.json.bind.annotation.JsonbTypeDeserializer;
import jakarta.json.bind.annotation.JsonbTypeSerializer;
import jakarta.json.bind.serializer.DeserializationContext;
import jakarta.json.bind.serializer.JsonbDeserializer;
import jakarta.json.bind.serializer.JsonbSerializer;
import jakarta.json.bind.serializer.SerializationContext;
import jakarta.json.stream.JsonGenerator;
import jakarta.json.stream.JsonParser;

import cloud.imagey.domain.encryption.PublicKey.Deserializer;
import cloud.imagey.domain.encryption.PublicKey.Serializer;

@JsonbTypeSerializer(Serializer.class)
@JsonbTypeDeserializer(Deserializer.class)
public record PublicKey(String key) {

    public static class Serializer implements JsonbSerializer<PublicKey> {

        @Override
        public void serialize(PublicKey key, JsonGenerator generator, SerializationContext context) {
            try (JsonReader reader = createReader(new StringReader(key.key()))) {
                generator.write(reader.readValue());
            }
        }
    }

    public static class Deserializer implements JsonbDeserializer<PublicKey> {

        @Override
        public PublicKey deserialize(JsonParser parser, DeserializationContext ctx, Type rtType) {
            return new PublicKey(parser.getValue().toString());
        }
    }
}
