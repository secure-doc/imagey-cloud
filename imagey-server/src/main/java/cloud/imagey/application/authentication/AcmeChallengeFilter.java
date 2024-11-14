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
package cloud.imagey.application.authentication;

import static javax.servlet.http.HttpServletResponse.SC_NOT_FOUND;
import static org.apache.commons.io.IOUtils.copy;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebFilter;
import javax.servlet.http.HttpFilter;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
@WebFilter(urlPatterns = "/.well-known/acme-challenge/*")
public class AcmeChallengeFilter extends HttpFilter {

    @Inject
    @ConfigProperty(name = "acme-challenge.path")
    private String root;

    @Override
    public void doFilter(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        String prefix = "/.well-known/acme-challenge/";
        String requestUri = request.getRequestURI();
        String filename = requestUri.substring(requestUri.indexOf(prefix) + prefix.length());
        if (filename.contains(".") || filename.contains("/")) { // don't allow path traversal
            response.sendError(SC_NOT_FOUND);
            return;
        }
        File file = new File(new File(root), filename);
        if (!file.exists()) {
            response.sendError(SC_NOT_FOUND);
            return;
        }
        try (InputStream fileStream = new FileInputStream(file);
            OutputStream responseStream = response.getOutputStream()) {

            copy(fileStream, response.getOutputStream());
        }
    }
}
