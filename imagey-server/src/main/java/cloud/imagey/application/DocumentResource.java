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
import static java.util.Base64.getDecoder;
import static java.util.Base64.getEncoder;
import static java.util.Optional.ofNullable;

import java.io.IOException;
import java.net.URI;
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
import jakarta.ws.rs.core.UriInfo;

import org.apache.cxf.jaxrs.ext.multipart.Attachment;
import org.apache.cxf.jaxrs.ext.multipart.Multipart;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentMetadata;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.document.FileName;
import cloud.imagey.domain.encryption.EncryptedContent;
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
/*
    @PUT
    @RolesAllowed("owner")
    @Path("{documentId}")
    @Consumes(APPLICATION_OCTET_STREAM)
    public Response storeEncryptedDocumentMetadata(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        EncryptedContent metadata) throws IOException {

        documentRepository.persist(user, documentId, metadata);
        return Response.ok().build();
    }
*/
    @GET
    @RolesAllowed({"owner", "recipient"})
    @Path("{documentId}/files/{contentId}")
    @Produces(APPLICATION_OCTET_STREAM)
    public EncryptedContent getDocumentContent(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("contentId") DocumentId contentId) throws IOException {

        return documentRepository.loadContent(user, documentId, contentId).orElseThrow(NotFoundException::new);
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

        EncryptedContent keyContent = new EncryptedContent(getDecoder().decode(key.sharedKey()));
        documentRepository.persist(user, documentId, userTheDocumentIsSharedWith, keyContent);
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
        @Context UriInfo uriInfo,
        @PathParam("email") User user,
        @Multipart(value = "metadata") EncryptedContent metadata,
        @Multipart(value = "key") byte[] keyBytes,
        @Multipart(value = "issuer") String issuer,
        List<Attachment> files) throws IOException {

        DocumentId documentId = documentRepository.persist(user, metadata);

        String encodedKey = getEncoder().encodeToString(keyBytes);
        EncryptedSharedKey sharedKey = new EncryptedSharedKey(issuer, "0", encodedKey);
        documentRepository.persist(user, documentId, new Email(issuer), new EncryptedContent(keyBytes));

        ofNullable(files).ifPresent(f -> f.stream().filter(a -> a.getContentDisposition().getFilename() != null).forEach(attachment -> {
            FileName name = new FileName(attachment.getContentDisposition().getFilename());
            EncryptedContent content = new EncryptedContent(attachment.getObject(byte[].class));
            documentRepository.persist(user, documentId, name, content);
        }));
        URI location = uriInfo.getAbsolutePathBuilder().path(documentId.id()).build();
        return Response.created(location).build();
    }
}
