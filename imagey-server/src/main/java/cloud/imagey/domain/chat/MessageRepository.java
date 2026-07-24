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
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.common.AbstractFileRepository;

@ApplicationScoped
public class MessageRepository extends AbstractFileRepository {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    public Message persist(User user, User sender, DocumentId documentId, MessageContent encryptedContent) {
        MessageId id = new MessageId();
        Message message = new Message(sender, encryptedContent);
        String jsonContent = create().toJson(message);

        File userHome = new File(rootPath, user.email().address());
        if (!userHome.exists()) {
            mkdir(userHome);
        }
        File documentsHome = new File(userHome, "documents");
        if (!documentsHome.exists()) {
            mkdir(documentsHome);
        }
        File documentFolder = new File(documentsHome, documentId.id());
        if (!documentFolder.exists()) {
            mkdir(documentFolder);
        }
        File messagesFolder = new File(documentFolder, "messages");
        if (!messagesFolder.exists()) {
            mkdir(messagesFolder);
        }
        File messageFile = new File(messagesFolder, id.value() + ".json");
        writeStringToFile(messageFile, jsonContent, UTF_8, false);

        return new Message(sender, encryptedContent)
            .withId(id)
            .inChannel(new Channel(documentId.id()));
    }

    public List<Message> fetchMessages(User user, DocumentId documentId, Optional<MessageId> sinceId) {
        File userHome = new File(rootPath, user.email().address());
        File documentsHome = new File(userHome, "documents");
        File documentFolder = new File(documentsHome, documentId.id());
        File messagesFolder = new File(documentFolder, "messages");

        List<Message> messages = new ArrayList<>();
        if (messagesFolder.exists() && messagesFolder.isDirectory()) {
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
}
