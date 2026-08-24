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
package cloud.imagey.infrastructure;

/**
 * Raised when a client's {@code If-Match} / {@code folderETag} precondition no longer matches the
 * stored resource - i.e. it was changed by someone else since the client last read it. Maps to
 * HTTP 412; the client is expected to re-read, re-apply its change and retry.
 */
public class PreconditionFailedException extends RuntimeException {

    public PreconditionFailedException(String reason) {
        super(reason);
    }
}
