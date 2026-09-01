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

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

/**
 * The test personas and their fixed {@link UserId}s. The ids match both the directory names under
 * {@code src/test/resources/data} and the {@code user-ids.json} lookup fixture there (whose keys are
 * {@code HMAC-SHA256(email, "test-user-mapping-pepper")}, the test value of {@code user.mapping.secret}).
 */
public final class UserFactory {

    public static final Email MARY_EMAIL = new Email("mary@imagey.cloud");
    public static final Email JOE_EMAIL = new Email("joe@imagey.cloud");
    public static final Email ALICE_EMAIL = new Email("alice@imagey.cloud");
    public static final Email BILL_EMAIL = new Email("bill@imagey.cloud");
    public static final Email LAURA_EMAIL = new Email("laura@imagey.cloud");

    public static final UserId MARY_ID = new UserId("d20cf443-4f96-418f-a957-c8cbef8677c3");
    public static final UserId JOE_ID = new UserId("35c34cb3-559d-4001-a67b-23259e45e69e");
    public static final UserId ALICE_ID = new UserId("10ad1cce-816b-4e12-b94d-7ef824c0d162");
    public static final UserId BILL_ID = new UserId("a358c2ed-07d4-4a25-a7db-d860d5c0b895");
    public static final UserId LAURA_ID = new UserId("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6");

    private UserFactory() {
    }

    public static User mary() {
        return new User(MARY_ID);
    }

    public static User joe() {
        return new User(JOE_ID);
    }

    public static User alice() {
        return new User(ALICE_ID);
    }

    public static User bill() {
        return new User(BILL_ID);
    }

    public static User laura() {
        return new User(LAURA_ID);
    }
}
