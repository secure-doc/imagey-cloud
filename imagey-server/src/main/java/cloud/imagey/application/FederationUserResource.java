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

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.federation.FederationAddress;
import cloud.imagey.domain.federation.FederationAssertionService;
import cloud.imagey.domain.federation.FederationSettings;
import cloud.imagey.domain.federation.ForeignUserMappingService;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.DomainName;
import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;
import cloud.imagey.domain.user.UserMappingService;
import cloud.imagey.infrastructure.federation.FederationDomain;

/**
 * The federation calls of a logged-in local user (ADR 0013): they sit below {@code {userId}}, so that
 * {@code owner} applies, and a guest - who is never owner of these paths - gets 403.
 */
@Path("/")
@ApplicationScoped
public class FederationUserResource {

    private static final Logger LOG = LogManager.getLogger(FederationUserResource.class);

    @Inject
    private FederationSettings settings;
    @Inject
    private FederationAssertionService assertionService;
    @Inject
    private UserMappingService userMappingService;
    @Inject
    private ForeignUserMappingService foreignUserMappingService;
    @Inject
    private Provider<DomainName> currentDomain;

    /**
     * The assertion with which the user proves to the server {@code aud} that they own {@code email}
     * (F5). Every refusal is a 403 without details: it concerns the logged-in user alone, there is no
     * oracle to protect.
     */
    @POST
    @RolesAllowed("owner")
    @Path("{userId}/federation-assertions")
    @Consumes(APPLICATION_JSON)
    @Produces(APPLICATION_JSON)
    public JsonObject assertion(@PathParam("userId") User user, AssertionRequest request) {
        requireEnabled();
        AssertionRequest body = Optional.ofNullable(request).orElse(new AssertionRequest(null, null));
        String aud = FederationDomain.normalize(body.aud()).orElse(null);
        Email email = FederationAddress.parse(body.email()).orElse(null);
        String iss = FederationSettings.domainOf(currentDomain.get());
        if (aud == null || email == null
            || settings.ownDomains().contains(aud)
            || !settings.ownDomains().contains(iss)
            || !userMappingService.findUserId(email).map(user.id()::equals).orElse(false)) {
            LOG.info("Assertion refused for audience {}", aud);
            throw new ForbiddenException();
        }
        return Json.createObjectBuilder().add("assertion", assertionService.mint(iss, email, aud)).build();
    }

    /**
     * The id {@code address} at {@code domain} has on this server (A6), created if it has none yet. Not
     * rate limited on purpose: only logged-in local users can call it, and a mapping is a tiny object.
     */
    @POST
    @RolesAllowed("owner")
    @Path("{userId}/foreign-principals")
    @Consumes(APPLICATION_JSON)
    @Produces(APPLICATION_JSON)
    public JsonObject foreignPrincipal(@PathParam("userId") User user, ForeignPrincipalRequest request) {
        requireEnabled();
        ForeignPrincipalRequest body = Optional.ofNullable(request).orElse(new ForeignPrincipalRequest(null, null));
        String domain = FederationDomain.normalize(body.domain()).orElse(null);
        Email address = FederationAddress.parse(body.address()).orElse(null);
        if (domain == null || address == null || settings.ownDomains().contains(domain)) {
            throw new BadRequestException();
        }
        UserId id = foreignUserMappingService.register(domain, address);
        return Json.createObjectBuilder().add("userId", id.id()).build();
    }

    // The responses are JSON objects built by hand: Johnzon writes a record with a single component as the bare value.
    private void requireEnabled() {
        if (!settings.enabled()) {
            throw new NotFoundException();
        }
    }

    public record AssertionRequest(String aud, String email) {
    }

    public record ForeignPrincipalRequest(String domain, String address) {
    }
}
