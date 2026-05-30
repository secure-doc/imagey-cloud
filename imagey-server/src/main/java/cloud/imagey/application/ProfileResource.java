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

import static jakarta.ws.rs.core.MediaType.MULTIPART_FORM_DATA;

import java.io.IOException;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;

import org.apache.cxf.jaxrs.ext.multipart.Multipart;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentContent;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentMetadata;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Path("{email}/profile")
public class ProfileResource {

    private static final Logger LOG = LogManager.getLogger(ProfileResource.class);
    private static final DocumentId PROFILE_ID = new DocumentId("profile");

    @Inject
    private DocumentRepository documentRepository;

    @PUT
    @RolesAllowed("owner")
    @Consumes(MULTIPART_FORM_DATA)
    public Response updateProfile(
        @PathParam("email") User user,
        @Multipart("metadata") DocumentMetadata metadata,
        @Multipart("sharedKey") EncryptedSharedKey sharedKey,
        @Multipart("content") DocumentContent content,
        @Multipart(value = "smallImage", required = false) DocumentContent smallImage,
        @Multipart(value = "previewImage", required = false) DocumentContent previewImage)
            throws IOException {

        // Ensure we are working with the profile document ID
        DocumentMetadata profileMetadata = new DocumentMetadata(
            PROFILE_ID,
            metadata.smallImageId(),
            metadata.previewImageId(),
            metadata.encryptedData(),
            metadata.sharedKey()
        );

        // Delete the existing profile document if it exists to allow overwriting
        documentRepository.deleteDocument(user, PROFILE_ID);

        // Persist the new profile document
        documentRepository.persist(user, PROFILE_ID, user.email(), sharedKey);
        documentRepository.persist(user, profileMetadata);
        documentRepository.persist(user, PROFILE_ID, PROFILE_ID, content);

        if (smallImage != null) {
            documentRepository.persist(user, PROFILE_ID, profileMetadata.smallImageId(), smallImage);
        }

        if (previewImage != null) {
            documentRepository.persist(user, PROFILE_ID, profileMetadata.previewImageId(), previewImage);
        }

        return Response.ok().build();
    }

    @GET
    @RolesAllowed({"owner", "contact", "contact-request"})
    @Produces(jakarta.ws.rs.core.MediaType.APPLICATION_JSON)
    public DocumentMetadata getProfileMetadata(@PathParam("email") User user) throws IOException {
        return documentRepository.findMetadata(user, PROFILE_ID);
    }
}
