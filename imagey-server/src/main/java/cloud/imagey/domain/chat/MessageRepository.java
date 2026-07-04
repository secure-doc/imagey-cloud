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

import static jakarta.json.bind.JsonbBuilder.create;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class MessageRepository extends AbstractFileRepository {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    Message persist(User receiver, User sender, MessageContent encryptedContent) {
        MessageId id = new MessageId();
        Message message = new Message(sender, encryptedContent);
        String jsonContent = create().toJson(message);

        File receiverHome = new File(rootPath, receiver.email().address());
        if (!receiverHome.exists()) {
            mkdir(receiverHome);
        }
        File messagesHome = new File(receiverHome, "messages");
        if (!messagesHome.exists()) {
            mkdir(messagesHome);
        }
        File senderFolder = new File(messagesHome, sender.email().address());
        if (!senderFolder.exists()) {
            mkdir(senderFolder);
        }
        File messageFile = new File(senderFolder, id.value() + ".json");
        writeStringToFile(messageFile, jsonContent, UTF_8, false);

        File senderHome = new File(rootPath, sender.email().address());
        if (!senderHome.exists()) {
            mkdir(senderHome);
        }
        File senderMessagesHome = new File(senderHome, "messages");
        if (!senderMessagesHome.exists()) {
            mkdir(senderMessagesHome);
        }
        File receiverFolder = new File(senderMessagesHome, receiver.email().address());
        if (!receiverFolder.exists()) {
            mkdir(receiverFolder);
        }
        File senderMessageFile = new File(receiverFolder, id.value() + ".json");
        writeStringToFile(senderMessageFile, jsonContent, UTF_8, false);

        return new Message(sender, encryptedContent)
            .withId(id)
            .inChannel(new Channel(sender.email().address() + ":" + receiver.email().address()));
    }

    public List<Message> fetchMessages(User receiver, User sender, java.util.Optional<MessageId> sinceId) {
        File receiverHome = new File(rootPath, receiver.email().address());
        File messagesHome = new File(receiverHome, "messages");
        File senderFolder = new File(messagesHome, sender.email().address());

        List<Message> messages = new ArrayList<>();
        if (senderFolder.exists() && senderFolder.isDirectory()) {
            File[] files = senderFolder.listFiles((dir, name) -> name.endsWith(".json"));
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
}
