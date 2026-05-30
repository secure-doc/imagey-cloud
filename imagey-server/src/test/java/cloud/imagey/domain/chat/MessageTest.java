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
package cloud.imagey.domain.chat;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

public class MessageTest {

    @Test
    void testMessageJsonbCreatorWithNulls() {
        Message message = new Message((String)null, (String)null, (String)null, (String)null);
        assertThat(message.id()).isNull();
        assertThat(message.sender()).isNull();
        assertThat(message.channel()).isNull();
        assertThat(message.content()).isNull();
    }

    @Test
    void testMessageJsonbCreatorWithValues() {
        Message message = new Message("msg-1", "sender@example.com", "sender:recipient", "encrypted");
        assertThat(message.id().value()).isEqualTo("msg-1");
        assertThat(message.sender().email().address()).isEqualTo("sender@example.com");
        assertThat(message.channel().value()).isEqualTo("sender:recipient");
        assertThat(message.content().value()).isEqualTo("encrypted");
    }

    @Test
    void testUserAdapter() {
        User.Adapter adapter = new User.Adapter();
        assertThat(adapter.adaptToJson(null)).isNull();
        assertThat(adapter.adaptFromJson(null)).isNull();

        User user = new User(new Email("test@example.com"));
        assertThat(adapter.adaptToJson(user)).isEqualTo("test@example.com");
        assertThat(adapter.adaptFromJson("test@example.com")).isEqualTo(user);
    }
}
