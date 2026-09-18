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
package cloud.imagey.infrastructure.storage;

import java.io.File;
import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.apache.commons.io.FileUtils;

import cloud.imagey.infrastructure.IoProblemException;
import cloud.imagey.infrastructure.common.Sha256;

/**
 * A {@link BlobStore} backed by the local filesystem, rooted at a given directory. Keys map directly onto
 * relative file paths under that root.
 *
 * <p>Every write first lands complete on a temp file in the same directory, then gets published under
 * the real key: a plain in-place write ({@code FileOutputStream}/{@code FileUtils.writeByteArrayToFile})
 * is not atomic, so a concurrent {@link #get} could otherwise observe a torn (partially written) file.
 * {@link #put} and the write side of {@link #putIfVersionMatches} publish via {@code Files.move} with
 * {@link java.nio.file.StandardCopyOption#ATOMIC_MOVE}, which is an unconditional {@code rename(2)} on
 * POSIX. {@link #putIfAbsent} cannot use that: {@code rename(2)} has no atomic "only if the target is
 * absent" mode, so {@code ATOMIC_MOVE} without {@code REPLACE_EXISTING} does <em>not</em> reliably fail
 * when the target already exists - it was observed to silently overwrite it instead. {@code
 * Files.createLink} ({@code link(2)}) does have that guarantee: creating a second name for the
 * already-fully-written temp file fails atomically with {@link FileAlreadyExistsException} if the target
 * name is taken, even across multiple JVM processes on the same disk. {@link #putIfVersionMatches}
 * additionally needs its check-then-write to be one atomic step, which neither primitive gives it on its
 * own, so it is guarded by an in-process striped lock, keyed by {@code key} (this backend was never meant
 * to be shared, lock-free, across multiple app instances - see ADR 0006/0010).
 *
 * <p>{@code version} (see {@link StoredObject}) is the hex-encoded SHA-256 of the content: deterministic,
 * always changes when the content does, and avoids the clock-granularity blind spot a file's {@code
 * lastModified} timestamp would have.
 */
public class FilesystemBlobStore implements BlobStore {

    private static final int LOCK_STRIPES = 64;

    private final File root;
    private final Object[] locks = new Object[LOCK_STRIPES];

    public FilesystemBlobStore(String rootPath) {
        this.root = new File(rootPath);
        for (int i = 0; i < locks.length; i++) {
            locks[i] = new Object();
        }
    }

    @Override
    public Optional<StoredObject> get(String key) {
        File file = fileFor(key);
        if (!file.isFile()) {
            return Optional.empty();
        }
        byte[] content = readBytes(file);
        return Optional.of(new StoredObject(content, versionOf(content)));
    }

    @Override
    public boolean exists(String key) {
        return fileFor(key).isFile();
    }

    @Override
    public boolean putIfAbsent(String key, byte[] content) {
        File file = fileFor(key);
        createParentDirectories(file);
        return publishIfAbsent(file, content);
    }

    @Override
    public boolean putIfVersionMatches(String key, byte[] content, String expectedVersion) {
        synchronized (lockFor(key)) {
            File file = fileFor(key);
            if (!file.isFile() || !versionOf(readBytes(file)).equals(expectedVersion)) {
                return false;
            }
            publishReplacing(file, content);
            return true;
        }
    }

    @Override
    public void put(String key, byte[] content) {
        File file = fileFor(key);
        createParentDirectories(file);
        publishReplacing(file, content);
    }

    @Override
    public ListResult list(String prefix, String delimiter) {
        File directory = prefix.isEmpty() ? root : new File(root, withoutTrailing(prefix, delimiter));
        File[] children = directory.listFiles();
        if (children == null) {
            return new ListResult(List.of(), List.of());
        }
        List<String> keys = new ArrayList<>();
        List<String> commonPrefixes = new ArrayList<>();
        for (File child : children) {
            String key = prefix + child.getName();
            if (child.isDirectory()) {
                commonPrefixes.add(key + delimiter);
            } else {
                keys.add(key);
            }
        }
        return new ListResult(keys, commonPrefixes);
    }

    @Override
    public void delete(String key) {
        File file = fileFor(key);
        if (file.exists() && !file.delete()) {
            throw new IoProblemException("Could not delete " + key);
        }
    }

    private File fileFor(String key) {
        return new File(root, key);
    }

    private Object lockFor(String key) {
        return locks[Math.floorMod(key.hashCode(), locks.length)];
    }

    private static String withoutTrailing(String prefix, String delimiter) {
        return prefix.endsWith(delimiter) ? prefix.substring(0, prefix.length() - delimiter.length()) : prefix;
    }

    private static void createParentDirectories(File file) {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory()) {
            throw new IoProblemException("Could not create directory " + parent);
        }
    }

    private static byte[] readBytes(File file) {
        try {
            return FileUtils.readFileToByteArray(file);
        } catch (IOException e) {
            throw new IoProblemException(e);
        }
    }

    /** Writes {@code content} unconditionally to {@code file}, replacing any existing content atomically. */
    private static void publishReplacing(File file, byte[] content) {
        File tmp = writeTempFile(file, content);
        try {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            tmp.delete();
            throw new IoProblemException(e);
        }
    }

    /**
     * Creates {@code file} with {@code content} if it does not exist yet - see the class-level Javadoc
     * for why this needs {@code Files.createLink} rather than a plain {@code ATOMIC_MOVE}.
     *
     * @return {@code true} if this call created {@code file}, {@code false} if it already existed
     */
    private static boolean publishIfAbsent(File file, byte[] content) {
        File tmp = writeTempFile(file, content);
        try {
            Files.createLink(file.toPath(), tmp.toPath());
            return true;
        } catch (FileAlreadyExistsException e) {
            return false;
        } catch (IOException e) {
            throw new IoProblemException(e);
        } finally {
            tmp.delete();
        }
    }

    private static File writeTempFile(File file, byte[] content) {
        try {
            File tmp = File.createTempFile("blob-", ".tmp", file.getParentFile());
            FileUtils.writeByteArrayToFile(tmp, content);
            return tmp;
        } catch (IOException e) {
            throw new IoProblemException(e);
        }
    }

    private static String versionOf(byte[] content) {
        return Sha256.hex(content);
    }
}
