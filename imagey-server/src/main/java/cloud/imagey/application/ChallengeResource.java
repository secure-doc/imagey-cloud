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

import java.util.Optional;
import java.util.logging.Logger;

import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.CookieParam;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.Response;

import cloud.imagey.domain.authentication.ChallengeService;
import cloud.imagey.domain.authentication.ChallengeService.ChallengeResponse;
import cloud.imagey.domain.authentication.ChallengeSignature;
import cloud.imagey.domain.token.DecodedToken;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.token.TokenService.TokenType;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.User;

@Path("{userId}/devices")
@ApplicationScoped
public class ChallengeResource {

    private static final Logger LOG = Logger.getLogger(ChallengeResource.class.getName());

    @Inject
    private ChallengeService challengeService;
    @Inject
    private TokenService tokenService;

    @POST
    @PermitAll
    @Path("{deviceId}/challenges")
    @Produces(APPLICATION_JSON)
    public Response createChallenge(@PathParam("userId") User user, @PathParam("deviceId") DeviceId deviceId) {
        ChallengeResponse challenge = challengeService.createChallenge(user, deviceId);
        return Response.status(Response.Status.CREATED).entity(challenge).build();
    }

    private boolean isTrustedSessionOf(User user, Cookie session) {
        return Optional.ofNullable(session)
            .flatMap(cookie -> tokenService.decode(new Token(cookie.getValue())))
            .filter(token -> token.isOfType(TokenType.AUTHENTICATION))
            .filter(token -> user.id().id().equals(token.jwt().getSubject()))
            .filter(DecodedToken::isTrusted)
            .isPresent();
    }

    @POST
    @PermitAll
    @Path("{deviceId}/authentications")
    @Consumes(APPLICATION_JSON)
    public Response verifyChallenge(
        @PathParam("userId") User user,
        @PathParam("deviceId") DeviceId deviceId,
        @QueryParam("trusted") @DefaultValue("false") boolean trusted,
        @QueryParam("rebind") @DefaultValue("false") boolean rebind,
        @CookieParam("token") Cookie session,
        ChallengeSignature signature) {

        challengeService.verifyChallenge(user, deviceId, signature);

        // Re-binding an existing session (ADR 0018) must not change whether it is trusted.
        boolean trustedSession = rebind ? isTrustedSessionOf(user, session) : trusted;
        return Response.ok()
                .header("Set-Cookie", tokenService.authenticationCookie(user, trustedSession, Optional.of(deviceId)))
                .build();
    }
}
