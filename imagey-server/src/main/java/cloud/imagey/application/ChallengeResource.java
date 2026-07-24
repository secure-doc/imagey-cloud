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

import java.util.logging.Logger;

import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;

import cloud.imagey.domain.authentication.ChallengeService;
import cloud.imagey.domain.authentication.ChallengeService.ChallengeResponse;
import cloud.imagey.domain.authentication.ChallengeSignature;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

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
    public Response createChallenge(@PathParam("userId") UserId userId, @PathParam("deviceId") DeviceId deviceId) {
        User user = new User(userId, null);
        ChallengeResponse challenge = challengeService.createChallenge(user, deviceId);
        return Response.status(Response.Status.CREATED).entity(challenge).build();
    }

    @POST
    @PermitAll
    @Path("{deviceId}/authentications")
    @Consumes(APPLICATION_JSON)
    public Response verifyChallenge(
        @PathParam("userId") UserId userId,
        @PathParam("deviceId") DeviceId deviceId,
        @QueryParam("trusted") @DefaultValue("false") boolean trusted,
        ChallengeSignature signature) {
        User user = new User(userId, null);

        challengeService.verifyChallenge(user, deviceId, signature);

        return Response.ok()
                .header("Set-Cookie", buildCookie(user, trusted))
                .build();
    }

    private String buildCookie(User user, boolean trusted) {
        long validity = trusted ? TokenService.ONE_MONTH : TokenService.ONE_HOUR;
        Token token = tokenService.generateAuthenticationToken(user, validity);
        String cookieHeader = "token=" + token.token() + "; HttpOnly; SameSite=strict; Path=/";
        if (trusted) {
            cookieHeader += "; Max-Age=2592000";
        }
        return cookieHeader;
    }
}
