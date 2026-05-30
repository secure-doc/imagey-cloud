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

import jakarta.json.bind.annotation.JsonbProperty;
import jakarta.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.domain.user.User;

public record Message(
    @JsonbProperty("id") @JsonbTypeAdapter(MessageId.Adapter.class) MessageId id,
    @JsonbProperty("sender") @JsonbTypeAdapter(User.Adapter.class) User sender,
    @JsonbProperty("channel") @JsonbTypeAdapter(Channel.Adapter.class) Channel channel,
    @JsonbProperty("content") @JsonbTypeAdapter(MessageContent.Adapter.class) MessageContent content) {
}
