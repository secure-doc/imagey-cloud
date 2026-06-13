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

import static java.util.Optional.ofNullable;
import static java.util.function.Predicate.not;

import java.util.Optional;

import jakarta.enterprise.context.RequestScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;

import cloud.imagey.domain.user.DomainName;

@RequestScoped
public class DomainNameProvider {

    @Inject
    private HttpServletRequest request;

    @Produces
    public DomainName getDomainName() {
        return getOriginOrReferer()
            .or(this::getHostFallback)
            .orElseGet(() -> new DomainName("https://secure-doc.store"));
    }

    private Optional<DomainName> getOriginOrReferer() {
        return ofNullable(request.getHeader("Origin"))
            .filter(not(String::isBlank))
            .map(DomainName::new)
            .or(() -> ofNullable(request.getHeader("Referer"))
                .filter(not(String::isBlank))
                .map(DomainName::new));
    }

    private Optional<DomainName> getHostFallback() {
        return ofNullable(request.getHeader("X-Forwarded-Host"))
            .filter(not(String::isBlank))
            .or(() -> ofNullable(request.getHeader("Host"))
                .filter(not(String::isBlank)))
            .map(host -> {
                String proto = ofNullable(request.getHeader("X-Forwarded-Proto"))
                    .filter(not(String::isBlank))
                    .orElseGet(request::getScheme);
                return new DomainName(proto + "://" + host);
            });
    }
}
