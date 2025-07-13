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

import static javax.ws.rs.core.MediaType.APPLICATION_JSON;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import javax.enterprise.context.ApplicationScoped;
import javax.ws.rs.Produces;
import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.GenericType;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.MultivaluedMap;
import javax.ws.rs.ext.MessageBodyWriter;
import javax.ws.rs.ext.Provider;
import javax.ws.rs.ext.Providers;

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
        Type genericListType = new GenericType<List<Map<String, Object>>>() { }.getType();
        providers.getMessageBodyWriter(List.class, genericListType, annotations, mediaType)
            .writeTo(result, Map.class, genericListType, annotations, mediaType, httpHeaders, entityStream);
    }
}
