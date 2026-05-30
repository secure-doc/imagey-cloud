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
package cloud.imagey.application.infrastructure;

import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.validation.ValidationException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

@Provider
@ApplicationScoped
public class ValidationExceptionMapper implements ExceptionMapper<ValidationException> {

    private static final Logger LOG = LogManager.getLogger(ValidationExceptionMapper.class);

    @Override
    public Response toResponse(ValidationException exception) {
        LOG.info(exception.getMessage(), exception);
        return Response.status(BAD_REQUEST).build();
    }
}
