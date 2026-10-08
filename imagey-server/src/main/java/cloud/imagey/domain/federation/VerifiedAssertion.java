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

import java.time.Instant;

import cloud.imagey.domain.mail.Email;

/**
 * What a valid assertion proves: the user with address {@code sub} is logged in at the server {@code iss}.
 * {@code jti} and {@code expires} are what {@link FederationAssertionVerifier#markUsed} needs to make it single use.
 */
public record VerifiedAssertion(String iss, Email sub, String jti, Instant expires) {
}
