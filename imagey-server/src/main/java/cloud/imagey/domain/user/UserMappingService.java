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
package cloud.imagey.domain.user;


import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbBuilder;

import cloud.imagey.domain.mail.Email;

@ApplicationScoped
public class UserMappingService {

    private static final String SECRET = System.getProperty("user.mapping.secret", System.getenv("USER_MAPPING_SECRET"));
    private static final String MAPPING_FILE = "user-ids.json";
    private static final String LOCK_FILE = "user-ids.lock";

    private final Path rootPath;
    private final Jsonb jsonb;

    public UserMappingService() {
        this.rootPath = Paths.get(System.getProperty("root.path", "target/data"));
        this.jsonb = JsonbBuilder.create();
        try {
            Files.createDirectories(rootPath);
        } catch (IOException e) {
            throw new RuntimeException("Could not create data directory", e);
        }
    }

    public Optional<UserId> findUserId(Email email) {
        String hash = hashEmail(email);
        return loadMapping().map(mapping -> mapping.get(hash)).map(UserId::new);
    }

    public UserId registerUser(Email email) {
        String hash = hashEmail(email);
        Path lockPath = rootPath.resolve(LOCK_FILE);

        try (FileChannel channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            FileLock lock = channel.lock()) {

            Map<String, String> mapping = loadMapping().orElseGet(HashMap::new);

            if (mapping.containsKey(hash)) {
                return new UserId(mapping.get(hash));
            }

            UserId newId = UserId.random();
            mapping.put(hash, newId.id());

            Path dataFile = rootPath.resolve(MAPPING_FILE);
            Path tmpFile = rootPath.resolve(MAPPING_FILE + ".tmp");

            String json = jsonb.toJson(mapping);
            Files.writeString(tmpFile, json);
            Files.move(tmpFile, dataFile, StandardCopyOption.ATOMIC_MOVE);

            return newId;

        } catch (IOException e) {
            throw new RuntimeException("Failed to register user mapping", e);
        }
    }

    private Optional<Map<String, String>> loadMapping() {
        Path dataFile = rootPath.resolve(MAPPING_FILE);
        if (!Files.exists(dataFile)) {
            return Optional.empty();
        }
        try {
            String json = Files.readString(dataFile);
            Map<String, String> mapping = jsonb.fromJson(json, new HashMap<String, String>() { }.getClass().getGenericSuperclass());
            return Optional.of(mapping);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read user mapping", e);
        }
    }

    private String hashEmail(Email email) {
        if (SECRET == null || SECRET.isEmpty()) {
            throw new IllegalStateException("USER_MAPPING_SECRET environment variable is not set");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(SECRET.getBytes(), "HmacSHA256");
            mac.init(secretKey);
            byte[] hash = mac.doFinal(email.address().getBytes());
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("Failed to hash email", e);
        }
    }
}
