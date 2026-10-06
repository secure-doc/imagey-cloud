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
package cloud.imagey.domain.federation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Federation settings (ADR 0013). While {@code federation.enabled} is {@code false} (the default)
 * the server behaves exactly like a stand-alone one: guest tokens are not accepted and no
 * cross-origin guest CORS headers are sent.
 */
@ApplicationScoped
public class FederationSettings {

    @Inject
    @ConfigProperty(name = "federation.enabled", defaultValue = "false")
    private boolean enabled;

    public FederationSettings() {
    }

    public FederationSettings(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean enabled() {
        return enabled;
    }
}
