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

/**
 * An assertion or invitation that does not let a guest in. The message is the reason, for the log
 * only: it never reaches an API response (ADR 0013 decision 5).
 */
public class InvalidAssertion extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InvalidAssertion(String reason) {
        super(reason);
    }
}
