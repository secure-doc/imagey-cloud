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

import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;

import cloud.imagey.infrastructure.federation.SigningKeyCipher;
import cloud.imagey.infrastructure.storage.BlobStore;
import cloud.imagey.infrastructure.storage.StoredObject;

/**
 * The key pair this server signs federation assertions with (ADR 0013 decision 1): ES256, one per
 * deployment, created on first use and kept encrypted in the blob store. The public part is published
 * at {@code GET /users/federation/key}. The {@code kid} is the RFC 7638 thumbprint, so that a foreign
 * server recognizes a rotated key without having to guess it from a failed signature.
 *
 * <p>Several instances may start at once: {@link BlobStore#putIfAbsent} decides who wins, and the
 * others use the winner's key. If the stored key cannot be decrypted (the secret changed), a new one
 * replaces it - rotation is cheap, because assertions live for a minute. To rotate by hand, delete the
 * object and restart the instances.
 */
@ApplicationScoped
public class FederationSigningKey {

    static final String STORAGE_KEY = "federation/signing-key.enc";

    private static final int MAX_ATTEMPTS = 3;
    private static final Logger LOG = LogManager.getLogger(FederationSigningKey.class);

    @Inject
    private BlobStore blobStore;

    @Inject
    @ConfigProperty(name = "authentication.secret")
    private String secret;

    private volatile ECKey key;

    public FederationSigningKey() {
    }

    public FederationSigningKey(BlobStore blobStore, String secret) {
        this.blobStore = blobStore;
        this.secret = secret;
    }

    /** The private key, to sign with. */
    public ECKey privateKey() {
        ECKey current = key;
        if (current == null) {
            synchronized (this) {
                current = key;
                if (current == null) {
                    current = load();
                    key = current;
                }
            }
        }
        return current;
    }

    public ECKey publicKey() {
        return privateKey().toPublicJWK();
    }

    /** The public key as published: a key set with exactly this one key. */
    public JWKSet publicKeySet() {
        return new JWKSet(publicKey());
    }

    public String keyId() {
        return privateKey().getKeyID();
    }

    // Every replacement is a create or a compare-and-swap, so that of several instances only one
    // key wins - and every instance uses the one that is stored, not necessarily its own.
    private ECKey load() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            Optional<StoredObject> stored = blobStore.get(STORAGE_KEY);
            if (stored.isPresent()) {
                Optional<ECKey> existing = decrypt(stored.get().content());
                if (existing.isPresent()) {
                    return existing.get();
                }
                LOG.warn("The federation signing key cannot be decrypted (changed secret?), replacing it");
            }
            ECKey fresh = generate();
            byte[] encrypted = SigningKeyCipher.encrypt(secret, fresh.toJSONString().getBytes(StandardCharsets.UTF_8));
            boolean written = stored.isPresent()
                ? blobStore.putIfVersionMatches(STORAGE_KEY, encrypted, stored.get().version())
                : blobStore.putIfAbsent(STORAGE_KEY, encrypted);
            if (written) {
                return fresh;
            }
            // another instance was faster: read what it wrote
        }
        throw new IllegalStateException("The federation signing key cannot be read");
    }

    private Optional<ECKey> decrypt(byte[] blob) {
        return SigningKeyCipher.decrypt(secret, blob).flatMap(plain -> {
            try {
                return Optional.of(ECKey.parse(new String(plain, StandardCharsets.UTF_8)));
            } catch (ParseException e) {
                return Optional.empty();
            }
        });
    }

    private static ECKey generate() {
        try {
            return new ECKeyGenerator(Curve.P_256)
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.ES256)
                .keyIDFromThumbprint(true)
                .generate();
        } catch (JOSEException e) {
            throw new IllegalStateException("Cannot generate the federation signing key", e);
        }
    }
}
