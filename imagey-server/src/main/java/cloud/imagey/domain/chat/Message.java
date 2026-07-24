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


import static java.util.Optional.ofNullable;

import jakarta.json.bind.annotation.JsonbCreator;
import jakarta.json.bind.annotation.JsonbProperty;
import jakarta.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

public record Message(
    @JsonbProperty("id") @JsonbTypeAdapter(MessageId.Adapter.class) MessageId id,
    @JsonbProperty("sender") User sender,
    @JsonbProperty("channel") @JsonbTypeAdapter(Channel.Adapter.class) Channel channel,
    @JsonbProperty("content") @JsonbTypeAdapter(MessageContent.Adapter.class) MessageContent content) {

    @JsonbCreator
    public Message(
        @JsonbProperty("id") String messageId,
        @JsonbProperty("sender") String sender,
        @JsonbProperty("channel") String channel,
        @JsonbProperty("content") String content) {

        this(ofNullable(messageId).map(MessageId::new).orElse(null),
            new User(new UserId(sender), null),
            ofNullable(channel).map(Channel::new).orElse(null),
            new MessageContent(content));
    }

    protected Message(User sender, MessageContent content) {
        this(null, sender, null, content);
    }

    public Message withId(MessageId messageId) {
        return new Message(messageId, sender, channel, content);
    }

    public Message inChannel(Channel messageChannel) {
        return new Message(id, sender, messageChannel, content);
    }
}
