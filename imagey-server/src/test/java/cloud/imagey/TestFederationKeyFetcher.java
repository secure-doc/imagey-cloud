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

import java.time.Duration;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Specializes;

import cloud.imagey.infrastructure.federation.FetchResult;
import cloud.imagey.infrastructure.federation.HttpFederationKeyFetcher;

/** Publishes the key of the {@link ForeignServer} without a network; every other domain is fetched as usual. */
@ApplicationScoped
@Specializes
public class TestFederationKeyFetcher extends HttpFederationKeyFetcher {

    @Override
    public FetchResult fetch(String domain) {
        if (ForeignServer.DOMAIN.equals(domain)) {
            return FetchResult.success(List.of(ForeignServer.publicKey()), Duration.ofMinutes(5));
        }
        return super.fetch(domain);
    }
}
