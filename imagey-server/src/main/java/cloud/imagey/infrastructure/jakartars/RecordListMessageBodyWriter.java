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

import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.ext.MessageBodyWriter;
import jakarta.ws.rs.ext.Provider;
import jakarta.ws.rs.ext.Providers;

@Provider
@ApplicationScoped
@Produces(APPLICATION_JSON)
public class RecordListMessageBodyWriter extends AbstractRecordMessageBodyWriter implements MessageBodyWriter<List<? extends Record>> {

    @Context
    private Providers providers;

    @Override
    public boolean isWriteable(Class<?> type, Type genericType, Annotation[] annotations, MediaType mediaType) {
        return List.class.isAssignableFrom(type)
            && (genericType instanceof ParameterizedType)
            && (((ParameterizedType)genericType).getActualTypeArguments()[0] instanceof Class)
            && ((Class<?>)((ParameterizedType)genericType).getActualTypeArguments()[0]).isRecord();
    }

    @Override
    public void writeTo(List<? extends Record> list, Class<?> type, Type genericType, Annotation[] annotations, MediaType mediaType,
        MultivaluedMap<String, Object> httpHeaders, OutputStream entityStream)
            throws IOException, WebApplicationException {

        List<Object> result = new ArrayList<>();
        for (Record r: list) {
            result.add(write(r));
        }
        providers.getMessageBodyWriter((Class)result.getClass(), result.getClass(), annotations, mediaType)
            .writeTo(result, result.getClass(), result.getClass(), annotations, mediaType, httpHeaders, entityStream);
    }
}
