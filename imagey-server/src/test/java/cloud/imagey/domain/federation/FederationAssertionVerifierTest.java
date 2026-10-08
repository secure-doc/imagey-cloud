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

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;

import cloud.imagey.ForeignServer;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.DomainName;
import cloud.imagey.infrastructure.federation.FederationKeyFetcher;
import cloud.imagey.infrastructure.federation.FetchResult;
import cloud.imagey.infrastructure.storage.FilesystemBlobStore;

class FederationAssertionVerifierTest {

    private static final Instant NOW = Instant.now();
    private static final JOSEObjectType ASSERTION_TYPE = new JOSEObjectType("fed-assertion+jwt");

    @TempDir
    private Path root;

    private final ECKey foreignKey = ForeignServer.generate();
    private final AtomicInteger fetches = new AtomicInteger();
    private FederationAssertionVerifier verifier;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        FederationSettings settings = new FederationSettings(true, List.of(new DomainName("https://own.example")));
        FederationKeyFetcher fetcher = domain -> {
            fetches.incrementAndGet();
            return "foreign.test".equals(domain)
                ? FetchResult.success(List.of(foreignKey.toPublicJWK()), Duration.ofMinutes(5))
                : FetchResult.failure(FetchResult.Failure.UNREACHABLE);
        };
        FederationSigningKey own = new FederationSigningKey(new FilesystemBlobStore(root.toString()), "secret");
        verifier = new FederationAssertionVerifier(settings, new FederationKeyResolver(settings, own, fetcher, clock), clock);
    }

    @Test
    @DisplayName("A valid assertion proves the address at the issuer")
    void valid() {
        VerifiedAssertion verified = verifier.verify(assertion(claims -> { }));

        assertThat(verified.iss()).isEqualTo("foreign.test");
        assertThat(verified.sub()).isEqualTo(new Email("bob@gmail.com"));
        assertThat(verified.jti()).isNotEmpty();
        assertThat(verified.expires()).isAfter(NOW);
    }

    @Test
    @DisplayName("Federation off: nothing is verified")
    void disabled() {
        FederationSettings off = new FederationSettings(false);

        assertThatThrownBy(() -> new FederationAssertionVerifier(off, null, null).verify("x")).isInstanceOf(InvalidAssertion.class);
    }

    @Test
    @DisplayName("Only ES256 with the assertion type and a key id: not none, not HS256, not another type")
    void headers() throws Exception {
        JWTClaimsSet claims = claims(c -> { }).build();

        assertThat(refused(new PlainJWT(claims).serialize())).isTrue();
        SignedJWT hs = new SignedJWT(header(JWSAlgorithm.HS256, "k", ASSERTION_TYPE), claims);
        hs.sign(new MACSigner(new byte[32]));
        assertThat(refused(hs.serialize())).isTrue();
        JWSHeader wrongType = header(JWSAlgorithm.ES256, foreignKey.getKeyID(), JOSEObjectType.JWT);
        assertThat(refused(ForeignServer.sign(claims, wrongType, foreignKey))).isTrue();
        JWSHeader noKeyId = header(JWSAlgorithm.ES256, null, ASSERTION_TYPE);
        assertThat(refused(ForeignServer.sign(claims, noKeyId, foreignKey))).isTrue();
        JWSHeader noType = new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(foreignKey.getKeyID()).build();
        assertThat(refused(ForeignServer.sign(claims, noType, foreignKey))).isTrue();
        JWSHeader emptyKeyId = header(JWSAlgorithm.ES256, "", ASSERTION_TYPE);
        assertThat(refused(ForeignServer.sign(claims, emptyKeyId, foreignKey))).isTrue();
        assertThat(refused("not a jwt")).isTrue();
        assertThat(refused(null)).isTrue();
        assertThat(refused("a".repeat(5000))).isTrue();
    }

    @Test
    @DisplayName("The issuer must be a plain foreign domain")
    void issuer() {
        assertThat(refused(assertion(c -> c.issuer("own.example")))).isTrue();
        assertThat(refused(assertion(c -> c.issuer("10.0.0.1")))).isTrue();
        assertThat(refused(assertion(c -> c.issuer("a/b.example")))).isTrue();
        assertThat(refused(assertion(c -> c.issuer(null)))).isTrue();
    }

    @Test
    @DisplayName("The audience must be this server, alone")
    void audience() {
        assertThat(refused(assertion(c -> c.audience("other.example")))).isTrue();
        assertThat(refused(assertion(c -> c.audience(List.of("own.example", "other.example"))))).isTrue();
        assertThat(refused(assertion(c -> c.audience(List.of())))).isTrue();
    }

    @Test
    @DisplayName("The times: not expired, not from the future, and a lifetime of two minutes at most")
    void times() {
        assertThat(refused(assertion(c -> c.issueTime(date(-200)).expirationTime(date(-100))))).isTrue();
        assertThat(refused(assertion(c -> c.issueTime(date(100)).expirationTime(date(160))))).isTrue();
        assertThat(refused(assertion(c -> c.issueTime(date(0)).expirationTime(date(121))))).isTrue();
        assertThat(refused(assertion(c -> c.issueTime(null)))).isTrue();
        assertThat(refused(assertion(c -> c.expirationTime(null)))).isTrue();
        // a clock that is a little off is tolerated
        assertThat(refused(assertion(c -> c.issueTime(date(20)).expirationTime(date(80))))).isFalse();
        assertThat(refused(assertion(c -> c.issueTime(date(-80)).expirationTime(date(-20))))).isFalse();
    }

    @Test
    @DisplayName("A jti is required, and so is an address as subject")
    void jtiAndSubject() {
        assertThat(refused(assertion(c -> c.jwtID(null)))).isTrue();
        assertThat(refused(assertion(c -> c.jwtID("")))).isTrue();
        assertThat(refused(assertion(c -> c.jwtID("x".repeat(200))))).isTrue();
        assertThat(refused(assertion(c -> c.subject("not-an-address")))).isTrue();
        assertThat(refused(assertion(c -> c.subject(null)))).isTrue();
    }

    @Test
    @DisplayName("The key must be known to the issuer, and the signature must match it")
    void signature() {
        ECKey stranger = ForeignServer.generate();

        assertThat(refused(sign(stranger))).isTrue();
        assertThat(refused(sign(foreignKey, c -> c.issuer("unknown.example")))).isTrue();
        assertThat(refused(sign(foreignKey))).isFalse();
    }

    @Test
    @DisplayName("An assertion can be used once")
    void replay() {
        VerifiedAssertion verified = verifier.verify(sign(foreignKey));

        verifier.markUsed(verified);

        assertThatThrownBy(() -> verifier.markUsed(verified)).isInstanceOf(InvalidAssertion.class);
    }

    @Test
    @DisplayName("Verifying alone uses nothing up: an assertion that is refused later does not take a place in the cache")
    void verifyDoesNotConsume() {
        String assertion = sign(foreignKey);

        verifier.verify(assertion);

        assertThat(refused(assertion)).isFalse();
    }

    private static JWSHeader header(JWSAlgorithm algorithm, String keyId, JOSEObjectType type) {
        return new JWSHeader.Builder(algorithm).keyID(keyId).type(type).build();
    }

    private String sign(ECKey key) {
        return sign(key, c -> { });
    }

    private String sign(ECKey key, Consumer<JWTClaimsSet.Builder> customizer) {
        return ForeignServer.sign(claims(customizer).build(), ForeignServer.header(foreignKey), key);
    }

    private String assertion(Consumer<JWTClaimsSet.Builder> customizer) {
        return sign(foreignKey, customizer);
    }

    private static JWTClaimsSet.Builder claims(Consumer<JWTClaimsSet.Builder> customizer) {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
            .issuer("foreign.test")
            .subject("bob@gmail.com")
            .audience("own.example")
            .issueTime(date(0))
            .expirationTime(date(60))
            .jwtID(UUID.randomUUID().toString());
        customizer.accept(claims);
        return claims;
    }

    private static Date date(long secondsFromNow) {
        return Date.from(NOW.plusSeconds(secondsFromNow));
    }

    private boolean refused(String assertion) {
        try {
            verifier.verify(assertion);
            return false;
        } catch (InvalidAssertion e) {
            return true;
        }
    }
}
