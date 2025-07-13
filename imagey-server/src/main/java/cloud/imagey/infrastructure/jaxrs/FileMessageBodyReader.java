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

import static javax.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM;
import static org.apache.commons.io.IOUtils.toByteArray;

import java.io.IOException;
import java.io.InputStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

import javax.enterprise.context.ApplicationScoped;
import javax.ws.rs.Consumes;
import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.MultivaluedMap;
import javax.ws.rs.ext.MessageBodyReader;
import javax.ws.rs.ext.Provider;
import javax.ws.rs.ext.Providers;

import cloud.imagey.infrastructure.common.AbstractRecordConverter;

@Provider
@ApplicationScoped
@Consumes(APPLICATION_OCTET_STREAM)
public class FileMessageBodyReader extends AbstractRecordConverter implements MessageBodyReader<Record> {

    @Context
    private Providers providers;

    @Override
    public boolean isReadable(Class<?> type, Type genericType, Annotation[] annotations, MediaType mediaType) {
        return type.isRecord() && type.getRecordComponents().length == 1 && byte[].class.equals(type.getRecordComponents()[0].getType());
    }

    @Override
    public Record readFrom(
        Class<Record> type,
        Type genericType,
        Annotation[] annotations,
        MediaType mediaType,
        MultivaluedMap<String, String> httpHeaders,
        InputStream entityStream) throws IOException, WebApplicationException {

        return instantiate(type, toByteArray(entityStream));
    }
}
