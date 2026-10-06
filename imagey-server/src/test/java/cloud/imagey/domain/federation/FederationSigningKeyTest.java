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
package cloud.imagey.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.KeyUse;

import cloud.imagey.infrastructure.storage.BlobStore;
import cloud.imagey.infrastructure.storage.FilesystemBlobStore;
import cloud.imagey.infrastructure.storage.ListResult;
import cloud.imagey.infrastructure.storage.StoredObject;

class FederationSigningKeyTest {

    private static final String SECRET = "a secret";

    @TempDir
    private Path root;

    @Test
    @DisplayName("The key is created on first use: ES256 on P-256, with the thumbprint as its id")
    void createdOnFirstUse() throws Exception {
        FederationSigningKey signingKey = new FederationSigningKey(store(), SECRET);

        ECKey key = signingKey.privateKey();

        assertThat(key.isPrivate()).isTrue();
        assertThat(key.getCurve()).isEqualTo(Curve.P_256);
        assertThat(key.getAlgorithm()).isEqualTo(JWSAlgorithm.ES256);
        assertThat(key.getKeyUse()).isEqualTo(KeyUse.SIGNATURE);
        assertThat(signingKey.keyId()).isEqualTo(key.computeThumbprint().toString());
        assertThat(signingKey.privateKey()).isSameAs(key);
    }

    @Test
    @DisplayName("The public key set holds the public part of the one key only")
    void publicKeySet() {
        FederationSigningKey signingKey = new FederationSigningKey(store(), SECRET);

        assertThat(signingKey.publicKey().isPrivate()).isFalse();
        assertThat(signingKey.publicKeySet().getKeys()).hasSize(1);
        assertThat(signingKey.publicKeySet().toString()).doesNotContain("\"d\"").contains(signingKey.keyId());
    }

    @Test
    @DisplayName("A second instance on the same store has the same key, and what is stored is not readable")
    void sameKeyOnTheSameStore() {
        BlobStore store = store();
        String keyId = new FederationSigningKey(store, SECRET).keyId();

        assertThat(new FederationSigningKey(store, SECRET).keyId()).isEqualTo(keyId);

        String stored = new String(store.get(FederationSigningKey.STORAGE_KEY).orElseThrow().content(), StandardCharsets.ISO_8859_1);
        assertThat(stored).doesNotContain("\"d\"").doesNotContain("EC").doesNotContain(keyId);
    }

    @Test
    @DisplayName("If another instance wins the race to create the key, its key is used")
    void lostRace() {
        BlobStore store = store();
        String winner = new FederationSigningKey(store, SECRET).keyId();
        BlobStore blind = new Delegating(store) {
            private boolean first = true;

            @Override
            public Optional<StoredObject> get(String key) {
                if (first) {
                    first = false;
                    return Optional.empty();
                }
                return super.get(key);
            }
        };

        assertThat(new FederationSigningKey(blind, SECRET).keyId()).isEqualTo(winner);
    }

    @Test
    @DisplayName("A key that cannot be decrypted (changed secret) is replaced")
    void changedSecret() {
        BlobStore store = store();
        String before = new FederationSigningKey(store, SECRET).keyId();

        String after = new FederationSigningKey(store, "another secret").keyId();

        assertThat(after).isNotEqualTo(before);
        assertThat(new FederationSigningKey(store, "another secret").keyId()).isEqualTo(after);
    }

    @Test
    @DisplayName("A stored blob that decrypts to something else than a key is replaced, too")
    void notAKey() {
        BlobStore store = store();
        store.put(FederationSigningKey.STORAGE_KEY, cloud.imagey.infrastructure.federation.SigningKeyCipher.encrypt(
            SECRET, "no json".getBytes(StandardCharsets.UTF_8)));

        assertThat(new FederationSigningKey(store, SECRET).privateKey().isPrivate()).isTrue();
    }

    @Test
    @DisplayName("If another instance replaces the unreadable key first, its key is used, not the own one")
    void lostReplacementRace() throws Exception {
        BlobStore store = store();
        new FederationSigningKey(store, "old secret").privateKey();
        BlobStore other = new FilesystemBlobStore(root.resolve("other").toString());
        String winner = new FederationSigningKey(other, SECRET).keyId();
        byte[] winnerBlob = other.get(FederationSigningKey.STORAGE_KEY).orElseThrow().content();
        BlobStore racing = new Delegating(store) {
            @Override
            public boolean putIfVersionMatches(String key, byte[] content, String expectedVersion) {
                super.put(key, winnerBlob);
                return false;
            }
        };

        assertThat(new FederationSigningKey(racing, SECRET).keyId()).isEqualTo(winner);
    }

    @Test
    @DisplayName("If the key can neither be read nor replaced, it is not available")
    void unreadable() {
        BlobStore store = store();
        store.put(FederationSigningKey.STORAGE_KEY, new byte[1]);
        BlobStore refusing = new Delegating(store) {
            @Override
            public boolean putIfVersionMatches(String key, byte[] content, String expectedVersion) {
                return false;
            }
        };

        assertThatThrownBy(() -> new FederationSigningKey(refusing, SECRET).privateKey()).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("CDI needs the no-argument constructor")
    void noArgConstructor() {
        assertThat(new FederationSigningKey()).isNotNull();
    }

    private BlobStore store() {
        return new FilesystemBlobStore(root.toString());
    }

    private static class Delegating implements BlobStore {
        private final BlobStore delegate;

        Delegating(BlobStore delegate) {
            this.delegate = delegate;
        }

        @Override
        public Optional<StoredObject> get(String key) {
            return delegate.get(key);
        }

        @Override
        public boolean exists(String key) {
            return delegate.exists(key);
        }

        @Override
        public boolean putIfAbsent(String key, byte[] content) {
            return delegate.putIfAbsent(key, content);
        }

        @Override
        public boolean putIfVersionMatches(String key, byte[] content, String expectedVersion) {
            return delegate.putIfVersionMatches(key, content, expectedVersion);
        }

        @Override
        public void put(String key, byte[] content) {
            delegate.put(key, content);
        }

        @Override
        public ListResult list(String prefix, String delimiter) {
            return delegate.list(prefix, delimiter);
        }

        @Override
        public void delete(String key) {
            delegate.delete(key);
        }
    }
}
