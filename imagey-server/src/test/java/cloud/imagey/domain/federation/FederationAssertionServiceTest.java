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

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.infrastructure.storage.FilesystemBlobStore;

class FederationAssertionServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

    @TempDir
    private Path root;

    @Test
    @DisplayName("The assertion is an ES256 JWS of its own type, signed with the key of this server, for one minute")
    void mint() throws Exception {
        FederationSigningKey key = new FederationSigningKey(new FilesystemBlobStore(root.toString()), "secret");
        FederationAssertionService service = new FederationAssertionService(key, Clock.fixed(NOW, ZoneOffset.UTC));

        SignedJWT jwt = SignedJWT.parse(service.mint("imagey.cloud", new Email("Bob@Gmail.com"), "other.example"));

        assertThat(jwt.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.ES256);
        assertThat(jwt.getHeader().getKeyID()).isEqualTo(key.keyId());
        assertThat(jwt.getHeader().getType().getType()).isEqualTo("fed-assertion+jwt");
        JWTClaimsSet claims = jwt.getJWTClaimsSet();
        assertThat(claims.getIssuer()).isEqualTo("imagey.cloud");
        assertThat(claims.getSubject()).isEqualTo("bob@gmail.com");
        assertThat(claims.getAudience()).containsExactly("other.example");
        assertThat(claims.getIssueTime().toInstant()).isEqualTo(NOW);
        assertThat(claims.getExpirationTime().toInstant()).isEqualTo(NOW.plusSeconds(60));
        assertThat(jwt.verify(new ECDSAVerifier(key.publicKeySet().getKeys().get(0).toECKey()))).isTrue();
    }

    @Test
    @DisplayName("Every assertion has its own jti")
    void uniqueJti() throws Exception {
        FederationSigningKey key = new FederationSigningKey(new FilesystemBlobStore(root.toString()), "secret");
        FederationAssertionService service = new FederationAssertionService(key, Clock.fixed(NOW, ZoneOffset.UTC));

        String first = SignedJWT.parse(service.mint("a.example", new Email("b@c.de"), "d.example")).getJWTClaimsSet().getJWTID();
        String second = SignedJWT.parse(service.mint("a.example", new Email("b@c.de"), "d.example")).getJWTClaimsSet().getJWTID();

        assertThat(first).isNotEqualTo(second);
    }
}
