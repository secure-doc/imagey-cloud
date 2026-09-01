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
import java.io.UncheckedIOException;
import java.lang.reflect.Type;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
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
import java.util.concurrent.locks.ReentrantLock;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.bind.Jsonb;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.mail.Email;

/**
 * Resolves an email address to the {@link UserId} of its account, and mints a new {@code UserId}
 * the first time an address is seen (registration, or an invitation sent to a not-yet-registered
 * address). The lookup table is a single JSON file {@code <root.path>/user-ids.json} mapping
 * {@code HMAC-SHA256(email)} to {@code UserId} - see ADR 0005/0006/0007.
 *
 * <p>The email is stored only as its keyed hash: an attacker who steals {@code user-ids.json}
 * cannot recover addresses without the {@code user.mapping.secret} pepper, which is injected at
 * runtime and never written next to the file.
 *
 * <p>Writes are safe across parallel JVMs and across threads of one JVM: the read-modify-write
 * cycle holds a process-wide {@link ReentrantLock} (an OS {@link FileLock} is per-JVM, so it
 * cannot serialise threads of the same instance and a second {@code channel.lock()} would throw
 * {@link java.nio.channels.OverlappingFileLockException}) plus an OS file lock on
 * {@code user-ids.lock} for the cross-JVM case. The file itself is only ever replaced by an atomic
 * rename of a fully-written temp file, so a concurrent reader never sees a partial map.
 */
@ApplicationScoped
public class UserMappingService {

    private static final String MAPPING_FILE = "user-ids.json";
    private static final String TMP_FILE = "user-ids.json.tmp";
    private static final String LOCK_FILE = "user-ids.lock";
    private static final Type STRING_MAP = new HashMap<String, String>() { }.getClass().getGenericSuperclass();

    // Serialises the read-modify-write across threads of this JVM; the FileLock below only guards
    // against other JVMs (and would throw OverlappingFileLockException between local threads).
    private static final ReentrantLock WRITE_LOCK = new ReentrantLock();

    @Inject
    private Jsonb jsonb;

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    // No default: deployment fails fast if user.mapping.secret is unset. Losing or changing the
    // pepper makes every existing mapping unrecoverable (ADR 0007), so it must be set explicitly.
    @Inject
    @ConfigProperty(name = "user.mapping.secret")
    private String mappingSecret;

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(root());
        } catch (IOException e) {
            throw new UncheckedIOException("Could not create data directory " + rootPath, e);
        }
    }

    public Optional<UserId> findUserId(Email email) {
        String hash = hashEmail(email);
        return Optional.ofNullable(loadMapping().get(hash)).map(UserId::new);
    }

    /**
     * The {@link UserId} for {@code email}, creating and persisting a fresh random one if this is
     * the first time the address is seen. Idempotent: a second call with the same address returns
     * the id minted by the first.
     */
    public UserId registerUser(Email email) {
        String hash = hashEmail(email);
        WRITE_LOCK.lock();
        try (FileChannel channel = openLockChannel(); FileLock lock = channel.lock()) {
            Map<String, String> mapping = loadMapping();
            String existing = mapping.get(hash);
            if (existing != null) {
                return new UserId(existing);
            }
            UserId newId = UserId.random();
            mapping.put(hash, newId.id());
            store(mapping);
            return newId;
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to register user mapping", e);
        } finally {
            WRITE_LOCK.unlock();
        }
    }

    private FileChannel openLockChannel() throws IOException {
        return FileChannel.open(
            root().resolve(LOCK_FILE), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
    }

    private void store(Map<String, String> mapping) throws IOException {
        Path tmp = root().resolve(TMP_FILE);
        Files.writeString(tmp, jsonb.toJson(mapping));
        Files.move(tmp, root().resolve(MAPPING_FILE),
            StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }

    private Map<String, String> loadMapping() {
        Path file = root().resolve(MAPPING_FILE);
        if (!Files.exists(file)) {
            return new HashMap<>();
        }
        try {
            Map<String, String> mapping = jsonb.fromJson(Files.readString(file), STRING_MAP);
            return mapping == null ? new HashMap<>() : new HashMap<>(mapping);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read " + file, e);
        }
    }

    private String hashEmail(Email email) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(mappingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(email.address().getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Failed to hash email", e);
        }
    }

    private Path root() {
        return Paths.get(rootPath);
    }
}
