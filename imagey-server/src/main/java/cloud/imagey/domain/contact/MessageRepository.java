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
package cloud.imagey.domain.contact;

import static jakarta.json.bind.JsonbBuilder.create;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;

import cloud.imagey.domain.common.AbstractUserFileRepository;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.user.User;

@ApplicationScoped
public class MessageRepository extends AbstractUserFileRepository {

    public Message persist(User owner, DocumentId chatId, User sender, MessageContent encryptedContent) {
        MessageId id = new MessageId();
        Message message = new Message(sender, encryptedContent);
        String jsonContent = create().toJson(message);

        File messagesFolder = messagesFolder(owner, chatId);
        if (!messagesFolder.exists()) {
            mkdir(messagesFolder);
        }
        File messageFile = new File(messagesFolder, id.value() + ".json");
        writeStringToFile(messageFile, jsonContent);

        return new Message(sender, encryptedContent)
            .withId(id)
            .inChannel(new Channel(chatId.id()));
    }

    public List<Message> fetchMessages(User owner, DocumentId chatId, Optional<MessageId> sinceId) {
        File messagesFolder = messagesFolder(owner, chatId);

        List<Message> messages = new ArrayList<>();
        // isDirectory() (rather than exists()) guards against a name collision with a regular file,
        // which would make listFiles() return null and Arrays.sort() NPE.
        if (messagesFolder.isDirectory()) {
            File[] files = messagesFolder.listFiles((dir, name) -> name.endsWith(".json"));
            Arrays.sort(files, Comparator.comparing(File::getName));
            for (File file : files) {
                String id = file.getName().replace(".json", "");
                if (sinceId.isEmpty() || new MessageId(id).compareTo(sinceId.get()) > 0) {
                    Message message = create().fromJson(readFileToString(file), Message.class);
                    messages.add(message.withId(new MessageId(id)));
                }
            }
        }
        return messages;
    }

    private File messagesFolder(User owner, DocumentId chatId) {
        File userHome = getUserHome(owner);
        File documentsHome = new File(userHome, "documents");
        File documentFolder = new File(documentsHome, chatId.id());
        return new File(documentFolder, "messages");
    }
}
