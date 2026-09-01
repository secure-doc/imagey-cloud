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
package cloud.imagey.domain.common;

import java.io.File;

import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

/**
 * A {@link AbstractFileRepository} for the repositories that are keyed by account: it adds the
 * {@link User}-typed {@code getUserHome} the infrastructure base cannot carry (the infrastructure
 * layer must not depend on domain types - see {@code ArchitectureTest#noCycles}).
 */
public abstract class AbstractUserFileRepository extends AbstractFileRepository {

    /** The storage tree of {@code user}, {@code <root.path>/<userId>}. */
    protected File getUserHome(User user) {
        return getUserHome(user.id().id());
    }
}
