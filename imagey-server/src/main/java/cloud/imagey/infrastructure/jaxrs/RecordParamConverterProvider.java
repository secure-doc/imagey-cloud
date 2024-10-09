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
package cloud.imagey.infrastructure.jaxrs;

import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

import javax.enterprise.context.ApplicationScoped;
import javax.ws.rs.ext.ParamConverter;
import javax.ws.rs.ext.ParamConverterProvider;
import javax.ws.rs.ext.Provider;

@Provider
@ApplicationScoped
public class RecordParamConverterProvider implements ParamConverterProvider {

    @Override
    public <T> ParamConverter<T> getConverter(Class<T> rawType, Type genericType, Annotation[] annotations) {
        if (!rawType.isRecord() || rawType.getRecordComponents().length > 1) {
            return null;
        }
        return new RecordParamConverter(rawType);
    }

    private record RecordParamConverter<R extends Record>(Class<R> recordType) implements ParamConverter<R> {

        @Override
        public R fromString(String value) {
            if (String.class.isAssignableFrom(recordType.getRecordComponents()[0].getType())) {
                try {
                    return recordType.getConstructor(String.class).newInstance(value);
                } catch (ReflectiveOperationException e) {
                    throw new IllegalStateException(e);
                }
            }
            RecordParamConverterProvider provider = new RecordParamConverterProvider();
            ParamConverter<?> converter = provider.getConverter((Class<?>)recordType.getRecordComponents()[0].getType(), null, null);
            Object instance = converter.fromString(value);
            try {
                return recordType.getConstructor(instance.getClass()).newInstance(instance);
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
        }

        @Override
        public String toString(Record value) {
            return value.toString();
        }
    }
}
