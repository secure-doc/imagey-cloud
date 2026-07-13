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

import static cloud.imagey.domain.document.DocumentId.CONTENT;
import static cloud.imagey.domain.document.DocumentId.PREVIEW;
import static cloud.imagey.domain.document.DocumentId.SMALL;
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
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import org.apache.cxf.jaxrs.ext.multipart.Multipart;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentMetadata;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.document.FileName;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Path("{email}/profile")
public class ProfileResource {

    private static final Logger LOG = LogManager.getLogger(ProfileResource.class);
    private static final DocumentId PROFILE_ID = new DocumentId("profile");

    @Inject
    private DocumentRepository documentRepository;

    @Context
    private SecurityContext securityContext;

    @PUT
    @RolesAllowed("owner")
    @Consumes(MULTIPART_FORM_DATA)
    public Response uploadDocument(
        @PathParam("email") User user,
        @Multipart("metadata") byte[] metadataBytes,
        @Multipart("key") byte[] keyBytes,
        @Multipart("issuer") String issuer,
        @Multipart("content") byte[] contentBytes,
        @Multipart(value = "smallImage", required = false) byte[] smallImageBytes,
        @Multipart(value = "previewImage", required = false) byte[] previewImageBytes)
            throws IOException {

        EncryptedContent metadata = new EncryptedContent(metadataBytes);
        DocumentId documentId = documentRepository.persist(user, metadata);
        EncryptedContent keyContent = new EncryptedContent(keyBytes);
        documentRepository.persist(user, documentId, new Email(issuer), keyContent);

        EncryptedContent content = new EncryptedContent(contentBytes);
        documentRepository.persist(user, documentId, new FileName(CONTENT.id()), content);

        if (smallImageBytes != null) {
            documentRepository.persist(user, documentId, new FileName(SMALL.id()), new EncryptedContent(smallImageBytes));
        }

        if (previewImageBytes != null) {
            documentRepository.persist(user, documentId, new FileName(PREVIEW.id()), new EncryptedContent(previewImageBytes));
        }

        return Response.ok().build();
    }

    @GET
    @RolesAllowed({"owner", "contact", "contact-request"})
    @Produces(jakarta.ws.rs.core.MediaType.APPLICATION_JSON)
    public DocumentMetadata getProfileMetadata(@PathParam("email") User user) throws IOException {
        Email callerEmail = new Email(securityContext.getUserPrincipal().getName());
        return documentRepository.findMetadata(user, PROFILE_ID, callerEmail);
    }
}
