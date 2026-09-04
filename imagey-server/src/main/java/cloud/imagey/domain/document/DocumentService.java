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
package cloud.imagey.domain.document;

import java.util.Objects;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.ValidationException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.user.User;
import cloud.imagey.infrastructure.PreconditionFailedException;
import cloud.imagey.infrastructure.ResourceConflictException;
import cloud.imagey.infrastructure.ResourceForbiddenException;
import cloud.imagey.infrastructure.ResourceNotFoundException;
import cloud.imagey.infrastructure.common.ETags;

@ApplicationScoped
public class DocumentService {

    private static final Logger LOG = LogManager.getLogger(DocumentService.class);

    // The folder ETag check and the folder-content write straddle several unrelated repository
    // writes and are not individually atomic. Two devices of the same user adding different
    // documents to the same folder could both pass the ETag check and then have the second write
    // clobber the first's addition (the classic "document vanishes" race the ETag was added to
    // fix). Serialising check+write per folder closes that window. A fixed set of stripes keeps
    // this bounded - an occasional collision between two folders only adds a little contention.
    private static final int FOLDER_LOCK_STRIPES = 64;
    private final Object[] folderLocks = new Object[FOLDER_LOCK_STRIPES];

    @Inject
    private DocumentRepository documentRepository;

    public DocumentService() {
        for (int i = 0; i < FOLDER_LOCK_STRIPES; i++) {
            folderLocks[i] = new Object();
        }
    }

    /**
     * Adds a freshly uploaded document to an existing folder: the new document's metadata, content
     * files and shared key are stored in {@code caller}'s tree, and the folder document's content
     * (now referencing the new document) is replaced in {@code folderOwner}'s tree. Both are the
     * same account when adding to one's own folder.
     *
     * <p>The upload is rejected unless
     * <ul>
     *   <li>the target folder already exists in {@code folderOwner}'s tree,</li>
     *   <li>{@code caller} owns that folder or is a member of it,</li>
     *   <li>the shared key is issued by {@code folderOwner} (it wraps the document key under the
     *       folder key), and</li>
     *   <li>the shared key's {@code kid} is the folder id.</li>
     * </ul>
     *
     * <p>The two-tree write is not transactional: if the folder update fails after the document was
     * stored, the caller is left with an unreferenced document they can re-link by retrying.
     *
     * <p>If the client sent a {@code folderETag} it is checked against the folder's current state
     * first: a mismatch means the folder was changed by someone else since the client built its
     * update, so the upload is rejected with 412 and nothing is written - the client re-reads the
     * folder, re-applies its change and retries.
     *
     * @throws ResourceNotFoundException   if the target folder does not exist
     * @throws ResourceForbiddenException  if {@code caller} is neither the folder owner nor a member
     * @throws ValidationException         if the shared key is not issued by {@code folderOwner} for this folder
     * @throws PreconditionFailedException if {@code folderETag} no longer matches the stored folder
     * @param accessPath the client-asserted chain proving {@code caller} reaches {@code folderId}
     *                   through a shared folder (ADR 0009); {@code null} for an own-tree or
     *                   direct-grant upload
     * @return the folder document's new ETag, so the caller can set the upload response header (and
     *         chain another change onto it) without re-reading {@code metadata.enc} a third time
     */
    public String uploadDocument(User caller, DocumentUpload upload, AccessPath accessPath) {
        User folderOwner = upload.folderOwner();
        DocumentId folderId = upload.folderId();
        DocumentId documentId = upload.documentId();
        EncryptedSharedKey sharedKey = upload.sharedKey();
        validate(caller, upload, accessPath);

        synchronized (folderLock(folderOwner, folderId)) {
            // Re-check under the lock: a concurrent upload into the same folder may have landed
            // between validate() above and here. This re-check and the folder-content write below
            // now happen atomically per folder, so the second writer sees a stale ETag and is
            // rejected instead of silently dropping the first writer's addition.
            requireCurrentFolderETag(folderOwner, folderId, upload.folderETag());

            documentRepository.persist(caller, documentId, upload.documentContent());
            documentRepository.create(caller, documentId, sharedKey);
            upload.files().forEach((name, content) -> documentRepository.persist(caller, documentId, name, content));
            documentRepository.persist(folderOwner, folderId, upload.folderContent());
        }

        LOG.info("Stored document {} for {} in folder {}/{}.",
            documentId.id(), caller.id().id(), folderOwner.id().id(), folderId.id());
        return documentRepository.etagOf(upload.folderContent());
    }

    private Object folderLock(User folderOwner, DocumentId folderId) {
        int stripe = Math.floorMod(Objects.hash(folderOwner.id().id(), folderId.id()), FOLDER_LOCK_STRIPES);
        return folderLocks[stripe];
    }

    private void validate(User caller, DocumentUpload upload, AccessPath accessPath) {
        requireComplete(upload);
        User folderOwner = upload.folderOwner();
        DocumentId folderId = upload.folderId();
        EncryptedSharedKey sharedKey = upload.sharedKey();
        if (!documentRepository.documentExists(folderOwner, folderId)) {
            throw new ResourceNotFoundException("Folder " + folderId.id() + " does not exist.");
        }
        if (documentRepository.documentExists(caller, upload.documentId())) {
            // This endpoint adds a *new* document. A documentId that already names one of the
            // caller's own documents (documentList, chatList, a folder, ...) would otherwise have
            // its metadata silently overwritten before create() 409s on the write-once key file.
            throw new ResourceConflictException("Document " + upload.documentId().id() + " already exists.");
        }
        requireFolderAccess(folderOwner, caller, folderId, accessPath);
        if (!folderOwner.equals(sharedKey.issuer())) {
            throw new ValidationException("The shared key issuer must be the folder owner.");
        }
        if (!folderId.id().equals(sharedKey.kid().id())) {
            throw new ValidationException("The shared key kid must be the folder id.");
        }
        requireCurrentFolderETag(folderOwner, folderId, upload.folderETag());
    }

    private static void requireComplete(DocumentUpload upload) {
        // folderContent / documentContent come from required multipart parts - a missing part is
        // already a 400 from the multipart provider before this method runs, so they are never null here.
        if (upload.folderOwner() == null || upload.folderId() == null
            || upload.documentId() == null || upload.sharedKey() == null) {
            throw new ValidationException("folderOwner, folderId, documentId, key, folder and document are all required.");
        }
    }

    private void requireCurrentFolderETag(User folderOwner, DocumentId folderId, String providedETag) {
        if (providedETag == null) {
            return;
        }
        String current = documentRepository.getETag(folderOwner, folderId).orElse(null);
        if (!ETags.matches(providedETag, current)) {
            throw new PreconditionFailedException(
                "Folder " + folderId.id() + " was modified since the client last read it.");
        }
    }

    private void requireFolderAccess(User folderOwner, User caller, DocumentId folderId, AccessPath accessPath) {
        if (!caller.equals(folderOwner)
            && !documentRepository.verifyAccess(folderOwner, folderId, caller, accessPath)) {
            throw new ResourceForbiddenException("The current user is not a member of folder " + folderId.id() + ".");
        }
    }
}
