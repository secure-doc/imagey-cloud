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

import jakarta.annotation.security.DenyAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.container.DynamicFeature;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.FeatureContext;
import jakarta.ws.rs.ext.Provider;

@Provider
@ApplicationScoped
public class RolesAllowedFeature implements DynamicFeature {

    @Override
    public void configure(ResourceInfo resourceInfo, FeatureContext context) {
        var method = resourceInfo.getResourceMethod();
        var clazz = resourceInfo.getResourceClass();

        RolesAllowed rolesAllowed = method.isAnnotationPresent(RolesAllowed.class)
            ? method.getAnnotation(RolesAllowed.class)
            : clazz.getAnnotation(RolesAllowed.class);

        if (rolesAllowed != null) {
            context.register(new UserInRoleFilter(rolesAllowed.value()));
            return;
        }

        if (method.isAnnotationPresent(DenyAll.class) || clazz.isAnnotationPresent(DenyAll.class)) {
            context.register(new UserInRoleFilter());
        }
    }
}
