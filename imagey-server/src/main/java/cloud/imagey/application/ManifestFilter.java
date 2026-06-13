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
package cloud.imagey.application;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import cloud.imagey.domain.user.DomainName;

@ApplicationScoped
@WebFilter(urlPatterns = "/manifest.json")
public class ManifestFilter extends HttpFilter {

    @Inject
    private Provider<DomainName> currentDomain;

    @Override
    protected void doFilter(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        DomainName domain = currentDomain.get();
        String appName = domain.getAppName();
        String shortName = appName;
        String id = appName.toLowerCase().replace(" ", "-");
        String startUrl = domain.value() == null ? "https://imagey.cloud" : domain.value();

        String json = """
            {
              "id": "%s",
              "name": "%s",
              "short_name": "%s",
              "description": "Store and share your images and documents safely.",
              "start_url": "%s",
              "display": "fullscreen",
              "icons": [
                {
                  "src": "image192.png",
                  "type": "image/png",
                  "sizes": "192x192"
                },
                {
                  "src": "image512.png",
                  "type": "image/png",
                  "sizes": "512x512"
                },
                {
                  "src": "image.svg",
                  "type": "image/svg+xml",
                  "sizes": "any"
                }
              ],
              "shortcuts": [
                {
                  "name": "Images",
                  "url": "/images",
                  "icons": [
                    {
                      "src": "image192.png",
                      "type": "image/png",
                      "sizes": "192x192"
                    },
                    {
                      "src": "image512.png",
                      "type": "image/png",
                      "sizes": "512x512"
                    },
                    {
                      "src": "image.svg",
                      "type": "image/svg+xml",
                      "sizes": "any"
                    }
                  ]
                },
                {
                  "name": "Chats",
                  "url": "/chats"
                }
              ]
            }
            """.formatted(id, appName + " - Your image vault", shortName, startUrl);

        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(json);
    }
}
