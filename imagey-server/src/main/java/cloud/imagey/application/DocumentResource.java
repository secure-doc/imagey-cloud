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
import static jakarta.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM;
import static jakarta.ws.rs.core.MediaType.MULTIPART_FORM_DATA;

import java.io.IOException;
import java.util.List;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
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

import cloud.imagey.domain.document.DocumentContent;
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentMetadata;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Path("{email}/documents")
public class DocumentResource {

    private static final Logger LOG = LogManager.getLogger(DocumentResource.class);

    @Inject
    private DocumentRepository documentRepository;

    @Context
    private SecurityContext securityContext;

    @GET
    @RolesAllowed("owner")
    @Produces(APPLICATION_JSON)
    public List<DocumentMetadata> getDocumentMetadata(
        @PathParam("email") User user) throws IOException {

        return documentRepository.findMetadata(user);
    }

    @GET
    @RolesAllowed({"owner", "recipient"})
    @Path("{documentId}")
    @Produces(APPLICATION_JSON)
    public DocumentMetadata getDocumentMetadata(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId) throws IOException {

        Email callerEmail = new Email(securityContext.getUserPrincipal().getName());
        return documentRepository.findMetadata(user, documentId, callerEmail);
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{documentId}")
    @Consumes(APPLICATION_JSON)
    public Response storeDocumentMetadata(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        DocumentMetadata metadata) throws IOException {

        documentRepository.persist(user, metadata);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed({"owner", "recipient"})
    @Path("{documentId}/files/{contentId}")
    @Produces(APPLICATION_OCTET_STREAM)
    public DocumentContent getDocumentContent(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("contentId") DocumentId contentId) throws IOException {

        return documentRepository.loadContent(user, documentId, contentId).orElseThrow(NotFoundException::new);
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{documentId}/files/{contentId}")
    @Consumes(APPLICATION_OCTET_STREAM)
    public Response storeDocumentContent(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("contentId") DocumentId contentId,
        DocumentContent content) throws IOException {

        documentRepository.persist(user, documentId, contentId, content);
        return Response.ok().build();
    }

    @GET
    @RolesAllowed({"owner", "recipient"})
    @Path("{documentId}/keys/{share-email}")
    @Produces(APPLICATION_JSON)
    public EncryptedSharedKey getSharedKey(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("share-email") Email userTheDocumentIsSharedWith) throws IOException {

        return documentRepository.findDocumentKey(user, documentId, userTheDocumentIsSharedWith)
                .orElseThrow(NotFoundException::new);
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{documentId}/keys/{share-email}")
    @Consumes(APPLICATION_JSON)
    public Response storeSharedKey(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("share-email") Email userTheDocumentIsSharedWith,
        EncryptedSharedKey key) throws IOException {

        documentRepository.persist(user, documentId, userTheDocumentIsSharedWith, key);
        return Response.ok().build();
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{documentId}/metadata.enc")
    @Consumes(APPLICATION_OCTET_STREAM)
    public Response storeEncryptedMetadata(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        byte[] metadata) throws IOException {

        documentRepository.persist(user, documentId, metadata);
        return Response.ok().build();
    }

    /**
     * Uploads a document via multipart form data containing metadata, shared key,
     * and multiple content streams.
     *
     * @param user  the user uploading the document
     * @param input the multipart form data input
     * @return a successful response if the upload succeeds
     * @throws IOException if reading the input fails
     */
    @POST
    @RolesAllowed("owner")
    @Consumes(MULTIPART_FORM_DATA)
    public Response uploadDocument(
        @PathParam("email") User user,
        @Multipart("metadata") DocumentMetadata metadata,
        @Multipart("sharedKey") EncryptedSharedKey sharedKey,
        @Multipart("content") DocumentContent content,
        @Multipart(value = "smallImage", required = false) DocumentContent smallImage,
        @Multipart(value = "previewImage", required = false) DocumentContent previewImage)
            throws IOException {

        documentRepository.persist(user, metadata.documentId(), user.email(), sharedKey);
        documentRepository.persist(user, metadata);
        documentRepository.persist(user, metadata.documentId(), metadata.documentId(), content);

        if (smallImage != null) {
            documentRepository.persist(user, metadata.documentId(), metadata.smallImageId(), smallImage);
        }

        if (previewImage != null) {
            documentRepository.persist(user, metadata.documentId(), metadata.previewImageId(), previewImage);
        }

        return Response.ok().build();
    }
}
