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

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The {@link BlobStore} contract, run against every implementation - see {@link FilesystemBlobStoreTest}
 * and {@link S3BlobStoreTest}. Concurrency tests belong here specifically: a mocked client would give
 * false confidence on exactly the two primitives ({@link BlobStore#putIfAbsent},
 * {@link BlobStore#putIfVersionMatches}) whose correctness under a real race is the entire point.
 */
abstract class BlobStoreContractTest {

    private static final byte[] CONTENT = "content".getBytes(StandardCharsets.UTF_8);
    private static final byte[] OTHER_CONTENT = "other".getBytes(StandardCharsets.UTF_8);
    private static final int DEFAULT_RACERS = 16;

    private BlobStore store;

    protected abstract BlobStore createStore();

    /** Overridable so a backend whose concurrent-connection burst capacity is constrained (a real S3-compatible
     * server behind Testcontainers on a resource-limited CI runner) can race fewer threads at once, without
     * weakening the property under test on a backend that has no such constraint (the local filesystem). */
    protected int racers() {
        return DEFAULT_RACERS;
    }

    @BeforeEach
    void createStoreForTest() {
        store = createStore();
    }

    @Test
    @DisplayName("get returns empty for a missing key")
    void getMissing() {
        assertThat(store.get("missing")).isEmpty();
    }

    @Test
    @DisplayName("put then get round-trips the content, creating parent keys")
    void putThenGet() {
        store.put("a/b/c.json", CONTENT);

        Optional<StoredObject> stored = store.get("a/b/c.json");

        assertThat(stored).isPresent();
        assertThat(stored.get().content()).isEqualTo(CONTENT);
        assertThat(store.exists("a/b/c.json")).isTrue();
    }

    @Test
    @DisplayName("put overwrites existing content unconditionally")
    void putOverwrites() {
        store.put("key", CONTENT);
        store.put("key", OTHER_CONTENT);

        assertThat(store.get("key").get().content()).isEqualTo(OTHER_CONTENT);
    }

    @Test
    @DisplayName("putIfAbsent creates the key and reports success")
    void putIfAbsentCreates() {
        boolean created = store.putIfAbsent("key", CONTENT);

        assertThat(created).isTrue();
        assertThat(store.get("key").get().content()).isEqualTo(CONTENT);
    }

    @Test
    @DisplayName("putIfAbsent leaves an existing key untouched and reports failure")
    void putIfAbsentDoesNotOverwrite() {
        store.putIfAbsent("key", CONTENT);

        boolean created = store.putIfAbsent("key", OTHER_CONTENT);

        assertThat(created).isFalse();
        assertThat(store.get("key").get().content()).isEqualTo(CONTENT);
    }

    @Test
    @DisplayName("concurrent putIfAbsent calls for the same key - exactly one wins")
    void concurrentPutIfAbsentHasExactlyOneWinner() throws InterruptedException, ExecutionException {
        int racers = racers();
        ExecutorService executor = Executors.newFixedThreadPool(racers);
        try {
            List<Callable<Boolean>> attempts = IntStream.range(0, racers)
                .<Callable<Boolean>>mapToObj(i -> {
                    byte[] content = ("racer-" + i).getBytes(StandardCharsets.UTF_8);
                    return () -> store.putIfAbsent("key", content);
                })
                .toList();
            List<Future<Boolean>> results = executor.invokeAll(attempts);

            assertThat(countWinners(results)).isEqualTo(1);
        } finally {
            executor.shutdown();
        }
    }

    @Test
    @DisplayName("putIfVersionMatches writes when the version is current")
    void putIfVersionMatchesWritesOnMatch() {
        store.put("key", CONTENT);
        String currentVersion = store.get("key").get().version();

        boolean written = store.putIfVersionMatches("key", OTHER_CONTENT, currentVersion);

        assertThat(written).isTrue();
        assertThat(store.get("key").get().content()).isEqualTo(OTHER_CONTENT);
    }

    @Test
    @DisplayName("putIfVersionMatches leaves content untouched on a stale version")
    void putIfVersionMatchesRejectsStaleVersion() {
        store.put("key", CONTENT);

        boolean written = store.putIfVersionMatches("key", OTHER_CONTENT, "stale-version");

        assertThat(written).isFalse();
        assertThat(store.get("key").get().content()).isEqualTo(CONTENT);
    }

    @Test
    @DisplayName("putIfVersionMatches fails for a key that does not exist yet")
    void putIfVersionMatchesRejectsMissingKey() {
        boolean written = store.putIfVersionMatches("missing", CONTENT, "any-version");

        assertThat(written).isFalse();
        assertThat(store.exists("missing")).isFalse();
    }

    @Test
    @DisplayName("concurrent putIfVersionMatches calls racing the same stale version - exactly one wins")
    void concurrentPutIfVersionMatchesHasExactlyOneWinner() throws InterruptedException, ExecutionException {
        store.put("key", CONTENT);
        String initialVersion = store.get("key").get().version();

        int racers = racers();
        ExecutorService executor = Executors.newFixedThreadPool(racers);
        try {
            List<Callable<Boolean>> attempts = IntStream.range(0, racers)
                .<Callable<Boolean>>mapToObj(i -> {
                    byte[] content = ("racer-" + i).getBytes(StandardCharsets.UTF_8);
                    return () -> store.putIfVersionMatches("key", content, initialVersion);
                })
                .toList();
            List<Future<Boolean>> results = executor.invokeAll(attempts);

            assertThat(countWinners(results)).isEqualTo(1);
        } finally {
            executor.shutdown();
        }
    }

    @Test
    @DisplayName("list splits direct keys from deeper common prefixes, one level at a time")
    void listSplitsKeysAndCommonPrefixes() {
        store.put("folder/file.json", CONTENT);
        store.put("folder/sub/nested.json", CONTENT);

        ListResult result = store.list("folder/", "/");

        assertThat(result.keys()).containsExactly("folder/file.json");
        assertThat(result.commonPrefixes()).containsExactly("folder/sub/");
    }

    @Test
    @DisplayName("list on a prefix with no matching keys returns an empty result")
    void listMissingPrefix() {
        ListResult result = store.list("missing/", "/");

        assertThat(result.keys()).isEmpty();
        assertThat(result.commonPrefixes()).isEmpty();
    }

    @Test
    @DisplayName("list on the empty (root) prefix splits top-level keys from top-level common prefixes")
    void listRootPrefix() {
        store.put("top-level.json", CONTENT);
        store.put("nested/file.json", CONTENT);

        ListResult result = store.list("", "/");

        assertThat(result.keys()).containsExactly("top-level.json");
        assertThat(result.commonPrefixes()).containsExactly("nested/");
    }

    @Test
    @DisplayName("delete removes an existing key")
    void deleteRemovesKey() {
        store.put("key", CONTENT);

        store.delete("key");

        assertThat(store.exists("key")).isFalse();
    }

    @Test
    @DisplayName("delete is a no-op for a key that does not exist")
    void deleteMissingKeyIsNoOp() {
        store.delete("missing");

        assertThat(store.exists("missing")).isFalse();
    }

    private static long countWinners(List<Future<Boolean>> results) throws ExecutionException, InterruptedException {
        long winners = 0;
        for (Future<Boolean> result : results) {
            if (result.get()) {
                winners++;
            }
        }
        return winners;
    }
}
