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

import static jakarta.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM;
import static org.apache.commons.io.IOUtils.toByteArray;

import java.io.IOException;
import java.io.InputStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.nio.charset.Charset;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.ext.MessageBodyReader;
import jakarta.ws.rs.ext.Provider;
import jakarta.ws.rs.ext.Providers;

import cloud.imagey.infrastructure.common.AbstractRecordConverter;

@Provider
@ApplicationScoped
@Consumes(APPLICATION_OCTET_STREAM)
public class FileMessageBodyReader extends AbstractRecordConverter implements MessageBodyReader<Record> {

    @Context
    private Providers providers;

    @Override
    public boolean isReadable(Class<?> type, Type genericType, Annotation[] annotations, MediaType mediaType) {
        if (!type.isRecord() || type.getRecordComponents().length != 1) {
            return false;
        }
        Class<?> componentType = type.getRecordComponents()[0].getType();
        return byte[].class.equals(componentType) || String.class.equals(componentType);
    }

    @Override
    public Record readFrom(
        Class<Record> type,
        Type genericType,
        Annotation[] annotations,
        MediaType mediaType,
        MultivaluedMap<String, String> httpHeaders,
        InputStream entityStream) throws IOException, WebApplicationException {

        // A raw octet-stream part can back either a byte[]-content record (e.g. EncryptedContent -
        // file-like blobs) or a String-content record (e.g. EncryptedPrivateKey - the browser client
        // sends it as an untyped Blob with type "application/octet-stream", not JSON or text/plain,
        // see AuthenticationRepository.ts/register()), so branch on the record's own component type.
        RecordComponent[] recordComponents = type.getRecordComponents();
        if (String.class.equals(recordComponents[0].getType())) {
            return instantiate(type, new String(toByteArray(entityStream), Charset.forName("UTF-8")));
        }
        return instantiate(type, toByteArray(entityStream));
    }
}
