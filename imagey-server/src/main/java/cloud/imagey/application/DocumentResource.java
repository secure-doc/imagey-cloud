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
import static jakarta.ws.rs.core.Response.created;
import static jakarta.ws.rs.core.Response.noContent;
import static jakarta.ws.rs.core.Response.ok;
import static java.util.Optional.ofNullable;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
import jakarta.ws.rs.core.EntityTag;
import jakarta.ws.rs.core.Request;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.ResponseBuilder;
import jakarta.ws.rs.core.UriInfo;

import org.apache.cxf.jaxrs.ext.multipart.Attachment;
import org.apache.cxf.jaxrs.ext.multipart.Multipart;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.document.DocumentService;
import cloud.imagey.domain.document.DocumentUpload;
import cloud.imagey.domain.document.EncryptedMetadata;
import cloud.imagey.domain.document.FileName;
import cloud.imagey.domain.document.UploadMetadata;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Path("{email}/documents")
public class DocumentResource {

    private static final Logger LOG = LogManager.getLogger(DocumentResource.class);

    @Inject
    private DocumentRepository documentRepository;

    @Inject
    private DocumentService documentService;

    @GET
    @RolesAllowed({"owner", "member"})
    @Path("{documentId}")
    @Produces(APPLICATION_OCTET_STREAM)
    public Response getDocument(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId) throws IOException {

        EncryptedMetadata metadata = documentRepository.loadEncryptedMetadataWithETag(user, documentId)
            .orElseThrow(NotFoundException::new);
        return ok(metadata.content()).tag(new EntityTag(metadata.etag())).build();
    }

    @PUT
    @RolesAllowed("owner")
    @Path("{documentId}")
    @Consumes(APPLICATION_OCTET_STREAM)
    public Response updateDocument(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        EncryptedContent metadata,
        @Context Request request) throws IOException {

        return documentRepository.getETag(user, documentId)
            .map(EntityTag::new)
            .map(request::evaluatePreconditions)
            .map(Optional::ofNullable)
            .filter(Optional::isPresent)
            .map(Optional::get)
            .map(ResponseBuilder::build).orElseGet(() -> {
                documentRepository.persist(user, documentId, metadata);
                // Hand back the new ETag so the client can chain another save without a re-read -
                // the PUT response is otherwise the only place it can learn the post-write tag
                // (a 204 with no tag leaves the client on a stale ETag and its next save 412s).
                ResponseBuilder response = noContent();
                documentRepository.getETag(user, documentId).ifPresent(etag -> response.tag(new EntityTag(etag)));
                return response.build();
            });
    }

    @GET
    @RolesAllowed({"owner", "member"})
    @Path("{documentId}/files/{contentId}")
    @Produces(APPLICATION_OCTET_STREAM)
    public EncryptedContent getDocumentContent(
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
        EncryptedContent content) throws IOException {

        documentRepository.persist(user, documentId, new FileName(contentId.id()), content);
        return ok().build();
    }

    @GET
    @RolesAllowed({"owner", "member"})
    @Path("{documentId}/keys/{kid}")
    @Produces(APPLICATION_JSON)
    public EncryptedSharedKey getSharedKey(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        @PathParam("kid") Kid kid) throws IOException {

        return documentRepository.findDocumentKey(user, documentId, kid)
                .orElseThrow(NotFoundException::new);
    }

    @POST
    @RolesAllowed("owner")
    @Path("{documentId}/keys")
    @Consumes(APPLICATION_JSON)
    public Response storeSharedKey(
        @PathParam("email") User user,
        @PathParam("documentId") DocumentId documentId,
        EncryptedSharedKey key) throws IOException {

        documentRepository.create(user, documentId, key);
        return ok().build();
    }

    @POST
    @RolesAllowed("owner")
    @Consumes(MULTIPART_FORM_DATA)
    public Response uploadDocument(
        @Context UriInfo uriInfo,
        @PathParam("email") User user,
        @Multipart("metadata") UploadMetadata metadata,
        @Multipart("folder") EncryptedContent folderContent,
        @Multipart("document") EncryptedContent documentContent,
        List<Attachment> files) throws IOException {

        Map<FileName, EncryptedContent> uploadedFiles = new LinkedHashMap<>();
        for (Attachment attachment: ofNullable(files).orElseGet(List::of)) {
            if (attachment.getContentDisposition().getFilename() != null) {
                uploadedFiles.put(
                    new FileName(attachment.getContentDisposition().getFilename()),
                    new EncryptedContent(attachment.getObject(byte[].class)));
            }
        }

        DocumentUpload upload = new DocumentUpload(
            metadata.folderOwner(),
            metadata.folderId(),
            folderContent,
            metadata.folderETag(),
            metadata.documentId(),
            documentContent,
            metadata.key(),
            uploadedFiles);
        String folderETag = documentService.uploadDocument(user, upload);

        URI location = uriInfo.getAbsolutePathBuilder().path(metadata.documentId().id()).build();
        // Hand back the folder's new ETag (computed by the service from the bytes it just wrote, so
        // no extra read here) - the client chains another change onto it without a re-read, and a
        // retry after a 412 lands on a known-fresh value.
        return created(location).tag(new EntityTag(folderETag)).build();
    }
}
