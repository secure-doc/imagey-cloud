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
package cloud.imagey.infrastructure.federation;

import java.time.Duration;
import java.util.List;

import com.nimbusds.jose.jwk.ECKey;

/**
 * The outcome of fetching the signing keys of a foreign server: either its keys with the {@code
 * max-age} it allows to cache them for (or {@code null} if it did not say), or the reason it failed.
 * The reason is for logs and metrics only and never reaches an API response (ADR 0013 decision 5).
 */
public record FetchResult(List<ECKey> keys, Duration maxAge, Failure failure) {

    public static FetchResult success(List<ECKey> keys, Duration maxAge) {
        return new FetchResult(List.copyOf(keys), maxAge, null);
    }

    public static FetchResult failure(Failure failure) {
        return new FetchResult(List.of(), null, failure);
    }

    public boolean isSuccess() {
        return failure == null;
    }

    public enum Failure {
        INVALID_DOMAIN, FORBIDDEN_ADDRESS, UNREACHABLE, TIMEOUT, BAD_RESPONSE, OVERLOADED
    }
}
