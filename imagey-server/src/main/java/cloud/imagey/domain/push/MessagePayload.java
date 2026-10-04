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
package cloud.imagey.domain.push;

import cloud.imagey.domain.contact.MessageId;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.user.User;

/**
 * A new chat message was posted (a plain message, a shared document or a group invitation - the
 * server cannot tell them apart, see ADR 0020) into {@code owner}'s chat {@code chatId}.
 */
public record MessagePayload(User owner, DocumentId chatId, MessageId messageId) implements PushPayload {

    @Override
    public String type() {
        return "message";
    }
}
