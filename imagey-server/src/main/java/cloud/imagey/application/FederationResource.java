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
package cloud.imagey.application;

import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;

import java.time.Clock;
import java.time.Duration;
import java.util.Optional;

import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.federation.FederationAssertionVerifier;
import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.domain.federation.FederationSigningKey;
import cloud.imagey.domain.federation.GuestSessionService;
import cloud.imagey.domain.federation.InvalidAssertion;
import cloud.imagey.domain.federation.VerifiedAssertion;
import cloud.imagey.domain.token.Token;
import cloud.imagey.infrastructure.federation.ClientAddress;
import cloud.imagey.infrastructure.federation.RateLimiter;
import cloud.imagey.infrastructure.federation.TrustedProxies;

/**
 * Server-to-server federation (ADR 0013). Like {@link PushResource} a literal segment below {@code
 * /users}, where the JAX-RS application lives; a user id is a UUID, so it never collides with one.
 */
@ApplicationScoped
@Path("federation")
public class FederationResource {

    private static final Logger LOG = LogManager.getLogger(FederationResource.class);
    private static final int MAX_CLIENTS = 10_000;
    private static final int TOO_MANY_REQUESTS = 429;
    private static final int MAX_TOKEN_LENGTH = 4096;

    @Inject
    private FederationSettings settings;

    @Inject
    private FederationSigningKey signingKey;

    @Inject
    private FederationAssertionVerifier verifier;

    @Inject
    private GuestSessionService guestSessions;

    @Inject
    private Clock clock;

    // Per instance, like the replay cache of the verifier: this server runs as one instance.
    private final RateLimiter rateLimiter = new RateLimiter(MAX_CLIENTS);
    private volatile TrustedProxies proxies;

    /**
     * The public key with which this server signs its assertions, as a key set with one key. Public
     * and without any authentication: a foreign server (and the browser of a user who types a server
     * name) has to read it before it knows anything about us. 404 while federation is off.
     */
    @GET
    @Path("key")
    @PermitAll
    @Produces("application/jwk-set+json")
    public Response key() {
        if (!settings.enabled()) {
            throw new NotFoundException();
        }
        CacheControl cacheControl = new CacheControl();
        cacheControl.setMaxAge((int) settings.keyMaxAge().toSeconds());
        return Response.ok(signingKey.publicKeySet().toString())
            .cacheControl(cacheControl)
            .header("X-Content-Type-Options", "nosniff")
            .build();
    }

    /**
     * Exchanges the assertion of a foreign server for a guest session (F4). Public: the assertion is
     * the credential. Every refusal is the same 401 with an empty body - what failed is only logged -
     * so that nobody can ask this server whether an address was invited (ADR 0013 decision 5). The
     * only other answer is 429, which says nothing about the request.
     */
    @POST
    @Path("sessions")
    @PermitAll
    @Consumes(APPLICATION_JSON)
    @Produces(APPLICATION_JSON)
    public Response sessions(SessionRequest request, @Context HttpServletRequest servlet) {
        if (!settings.enabled()) {
            throw new NotFoundException();
        }
        String client = ClientAddress.of(servlet.getRemoteAddr(), servlet.getHeader("X-Forwarded-For"), proxies());
        Optional<Duration> wait = rateLimiter.tryAcquire(
            client, settings.sessionsPerMinute(), Duration.ofMinutes(1), clock.instant());
        if (wait.isPresent()) {
            return Response.status(TOO_MANY_REQUESTS)
                .header("Retry-After", Math.max(1, wait.get().toSeconds()))
                .build();
        }
        SessionRequest body = Optional.ofNullable(request).orElse(new SessionRequest(null, null));
        try {
            VerifiedAssertion assertion = verifier.verify(body.assertion());
            GuestSessionService.Session session = guestSessions.establish(assertion, invitation(body.invitationToken()));
            // Last, and only for an assertion that let somebody in (see markUsed); establish is idempotent.
            verifier.markUsed(assertion);
            return Response.ok(new SessionResponse(session.token().token(), session.userId().id(), session.expiresIn())).build();
        } catch (InvalidAssertion e) {
            LOG.info("Federation session refused: {}", e.getMessage());
            return Response.status(Response.Status.UNAUTHORIZED).type(APPLICATION_JSON).entity("{}").build();
        }
    }

    private static Optional<Token> invitation(String token) {
        if (token == null) {
            return Optional.empty();
        }
        if (token.isEmpty() || token.length() > MAX_TOKEN_LENGTH) {
            throw new InvalidAssertion("invitation token empty or too long");
        }
        return Optional.of(new Token(token));
    }

    // The trusted proxies are configuration and do not change while the server runs
    private TrustedProxies proxies() {
        TrustedProxies current = proxies;
        if (current == null) {
            current = new TrustedProxies(settings.trustedProxies());
            proxies = current;
        }
        return current;
    }

    public record SessionRequest(String assertion, String invitationToken) {
    }

    public record SessionResponse(String token, String userId, long expiresIn) {
    }
}
