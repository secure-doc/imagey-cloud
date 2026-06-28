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

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.mail.EmailException;

@Provider
@ApplicationScoped
public class EmailExceptionMapper implements ExceptionMapper<EmailException> {

    private static final int TEMPORARILY_NOT_AVAILABLE = 503;
    private static final Logger LOG = LogManager.getLogger(EmailExceptionMapper.class);

    @Override
    public Response toResponse(EmailException exception) {
        LOG.error("Mail server is currently unavailable.", exception);
        return Response.status(TEMPORARILY_NOT_AVAILABLE).build();
    }
}
