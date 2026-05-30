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
package cloud.imagey;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

@WebFilter("/*")
public class MultipartMockFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        String contentType = req.getContentType();
        if (contentType != null && contentType.contains("multipart/form-data") && req.getContentLength() <= 0) {
            String boundary = "----WebKitFormBoundary";
            String body = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"metadata\"\r\n"
                + "Content-Type: application/json\r\n\r\n"
                + "{\"documentId\": \"00000000-0000-0000-0000-000000000000\", \"name\": \"Mary Doe\"}\r\n"
                + "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"sharedKey\"\r\n"
                + "Content-Type: application/json\r\n\r\n"
                + "{\"key\": \"dummy\"}\r\n"
                + "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"content\"; filename=\"dummy.txt\"\r\n"
                + "Content-Type: application/octet-stream\r\n\r\n"
                + "dummy\r\n"
                + "--" + boundary + "--\r\n";
            byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);

            HttpServletRequestWrapper wrapper = new HttpServletRequestWrapper(req) {
                @Override
                public ServletInputStream getInputStream() throws IOException {
                    return new ServletInputStream() {
                        private final ByteArrayInputStream bais = new ByteArrayInputStream(bodyBytes);

                        @Override
                        public int read() throws IOException {
                            return bais.read();
                        }

                        @Override
                        public int read(byte[] b, int off, int len) throws IOException {
                            return bais.read(b, off, len);
                        }

                        @Override
                        public int read(byte[] b) throws IOException {
                            return bais.read(b);
                        }

                        @Override
                        public boolean isFinished() {
                            return bais.available() == 0;
                        }

                        @Override
                        public boolean isReady() {
                            return true;
                        }

                        @Override
                        public void setReadListener(ReadListener readListener) {
                        }
                    };
                }

                @Override
                public int getContentLength() {
                    return bodyBytes.length;
                }

                @Override
                public long getContentLengthLong() {
                    return bodyBytes.length;
                }
            };
            chain.doFilter(wrapper, response);
            return;
        }
        chain.doFilter(request, response);
    }
}
