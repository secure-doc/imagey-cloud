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

import static javax.ws.rs.core.MediaType.APPLICATION_JSON;
import static javax.ws.rs.core.MediaType.APPLICATION_OCTET_STREAM;
import static javax.ws.rs.core.MediaType.TEXT_PLAIN;
import static javax.ws.rs.core.Response.Status.FORBIDDEN;

import java.io.IOException;
import java.util.List;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.NotFoundException;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.Response;

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

    @GET
    @Produces(APPLICATION_JSON)
    public List<DocumentMetadata> getDocumentMetadata(
        @PathParam("email") User user) throws IOException {

        return documentRepository.findMetadata(user);
    }

    @GET
    @Path("{documentId}/meta-data")
    @Produces(APPLICATION_JSON)
    public DocumentMetadata getDocumentMetadata(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId) throws IOException {

        return documentRepository.findMetadata(user, documentId);
    }

    @PUT
    @Path("{documentId}/meta-data")
    @Consumes(APPLICATION_JSON)
    public Response storeDocumentMetadata(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        DocumentMetadata metadata) throws IOException {

        if (!documentId.equals(metadata.documentId())) {
            throw new WebApplicationException(FORBIDDEN);
        }
        documentRepository.persist(user, metadata);
        return Response.ok().build();
    }

    @GET
    @Path("{documentId}/contents/{contentId}")
    @Produces(APPLICATION_OCTET_STREAM)
    public DocumentContent getDocumentContent(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("contentId") DocumentId contentId) throws IOException {

        return documentRepository.loadContent(user, documentId, contentId).orElseThrow(NotFoundException::new);
    }

    @PUT
    @Path("{documentId}/contents/{contentId}")
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
    @Path("{documentId}/encrypted-shared-keys/{share-email}")
    @Produces(TEXT_PLAIN)
    public EncryptedSharedKey getSharedKey(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("share-email") Email userTheDocumentIsSharedWith) throws IOException {

        return documentRepository.findDocumentKey(user, documentId, userTheDocumentIsSharedWith)
            .orElseThrow(NotFoundException::new);
    }

    @PUT
    @Path("{documentId}/encrypted-shared-keys/{share-email}")
    @Consumes(TEXT_PLAIN)
    public Response storeSharedKey(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("share-email") Email userTheDocumentIsSharedWith,
        String key) throws IOException {

        documentRepository.persist(user, documentId, userTheDocumentIsSharedWith, new EncryptedSharedKey(key));
        return Response.ok().build();
    }
}
