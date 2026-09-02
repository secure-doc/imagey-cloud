import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { Settings } from "../contexts/AuthenticationContext";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import {
  documentRepository,
  PreconditionFailedError,
} from "./DocumentRepository";

// How often storeDocument re-reads the parent folder and retries after the
// server rejected the upload because the folder changed concurrently.
const MAX_FOLDER_UPDATE_RETRIES = 3;

// The result of adding a child (document or sub-folder) to a folder: the new
// child's metadata plus the parent folder's state *after* the write - its full
// document list (which, after a concurrent-change retry, also picks up whatever
// siblings were added meanwhile) and its new ETag - so the caller can keep its
// in-memory folder fresh for the next change without a re-fetch.
export interface StoreResult {
  document: DocumentMetadata;
  parentFolderDocuments: string[];
  parentFolderETag: string | null;
}

export const documentService = {
  // `wrappingKey` is normally a symmetric parent-document key (a folder,
  // the "chats" document, ...). Pass `privateKey` too when the key entry
  // was instead ECDH-wrapped for a specific recipient (a document or chat
  // shared with someone outside its own folder hierarchy) - in that case
  // `wrappingKey` is the *other* party's public key, not a symmetric key.
  loadKey: async (
    userId: string,
    documentId: string,
    kid: string,
    wrappingKey: JsonWebKey,
    privateKey?: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const key = await documentRepository.loadKey(userId, documentId, kid);
    return cryptoService.decryptKey(key.sharedKey, wrappingKey, privateKey);
  },
  storeFolder: async (
    userId: string,
    name: string,
    parentFolder: Document,
    parentFolderKey: JsonWebKey,
  ): Promise<StoreResult> => {
    const file = new File([], name, { type: "Folder" });
    return documentService.storeDocument(
      userId,
      file,
      parentFolder,
      parentFolderKey,
    );
  },

  storeDocument: async (
    userId: string,
    file: File,
    parentFolder: Document,
    parentFolderKey: JsonWebKey,
  ): Promise<StoreResult> => {
    // Adding a child is a read-modify-write of the parent's (encrypted, so
    // server-un-mergeable) child list. If the folder we were handed is a
    // failed-load placeholder, we don't actually know its contents - writing
    // our single-entry list would silently drop every existing child. Fail
    // loudly instead; the caller can reload and retry.
    if (parentFolder.loadFailed) {
      throw new Error(
        `Cannot add to folder ${parentFolder.documentId}: it was not loaded cleanly`,
      );
    }
    const buffers: ArrayBuffer[] =
      file.size > 0 ? [await file.arrayBuffer()] : [];
    const documentKey = await cryptoService.generateSymmetricKey();
    const documentId = cryptoService.generateUuid();
    // A zero-byte "file" (a folder) has no content blob - don't mint a
    // contentId for content that doesn't exist, or we'd upload the string
    // "undefined" as its content file and leave a dangling contentId in the
    // metadata.
    const contentId =
      buffers.length > 0 ? cryptoService.generateUuid() : undefined;
    const documentMetadata: DocumentMetadata = {
      documentId: documentId,
      name: file.name,
      type: file.type,
      size: file.size,
      key: documentKey,
      ...(contentId ? { contentId } : {}),
    };
    // A folder always carries an (initially empty) child list, so a reader
    // never sees `documents` undefined and can tell "empty folder" apart from
    // "still loading".
    if (file.type === "Folder") {
      documentMetadata.documents = [];
    }
    if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      documentMetadata.smallImageId = cryptoService.generateUuid();
      documentMetadata.previewImageId = cryptoService.generateUuid();
    }
    const encryptedContent = await cryptoService.encryptDocument(documentKey, [
      new TextEncoder().encode(JSON.stringify(documentMetadata)).buffer,
      ...buffers,
    ]);
    // The parent folder may belong to someone who shared it with us; its key is theirs, so the new
    // document's key entry is issued by them, and its content update goes to their tree.
    const folderOwner = parentFolder.owner ?? userId;
    const files: { filename: string; buffer: ArrayBuffer }[] = [];
    if (contentId) {
      files.push({ filename: contentId, buffer: encryptedContent[1] });
    }
    if (documentMetadata.smallImageId) {
      files.push({
        filename: documentMetadata.smallImageId,
        buffer: encryptedContent[2],
      });
    }
    if (documentMetadata.previewImageId) {
      files.push({
        filename: documentMetadata.previewImageId,
        buffer: encryptedContent[3],
      });
    }

    // Adding the document to the folder is a read-modify-write of the folder's
    // (encrypted, so un-mergeable server-side) document list. If the folder
    // changed since we loaded it - e.g. a sibling upload, or another device -
    // the server rejects the upload with 412; we then re-read the folder,
    // re-apply our addition and retry so the concurrent change is not lost.
    let currentDocuments = parentFolder.documents;
    let currentETag: string | null = parentFolder.etag ?? null;
    for (let attempt = 1; attempt <= MAX_FOLDER_UPDATE_RETRIES; attempt++) {
      const newDocuments = currentDocuments
        ? [...currentDocuments, documentId]
        : [documentId];
      const folderForUpload: Document = {
        ...parentFolder,
        documents: newDocuments,
      };
      delete folderForUpload.etag;
      const newEncryptedParent = await cryptoService.encryptDocument(
        parentFolderKey,
        [new TextEncoder().encode(JSON.stringify(folderForUpload)).buffer],
      );
      const encryptedKey = await cryptoService.encryptKey(
        documentKey,
        parentFolderKey,
      );
      try {
        const { folderETag } = await documentRepository.uploadDocument(
          userId,
          folderOwner,
          parentFolder.documentId,
          newEncryptedParent[0],
          currentETag,
          documentId,
          encryptedContent[0],
          {
            issuer: folderOwner,
            kid: parentFolder.documentId,
            sharedKey: encryptedKey,
          },
          files,
        );
        return {
          document: documentMetadata,
          parentFolderDocuments: newDocuments,
          parentFolderETag: folderETag,
        };
      } catch (e) {
        if (
          !(e instanceof PreconditionFailedError) ||
          attempt >= MAX_FOLDER_UPDATE_RETRIES
        ) {
          throw e;
        }
        const reloaded = await reloadFolderDocuments(
          folderOwner,
          parentFolder.documentId,
          parentFolderKey,
        );
        currentDocuments = reloaded.documents;
        currentETag = reloaded.etag;
      }
    }
    // Unreachable: the final iteration either returns or rethrows.
    throw new PreconditionFailedError("Folder update retries exhausted");
  },

  // Encrypts and uploads a new file for an EXISTING document (e.g. a
  // replacement profile picture) and returns the new content id.
  storeContent: async (
    userId: string,
    documentId: string,
    documentKey: JsonWebKey,
    content: File,
  ): Promise<string> => {
    const contentId = cryptoService.generateUuid();
    const [encryptedContent] = await cryptoService.encryptDocument(
      documentKey,
      [await content.arrayBuffer()],
    );
    await documentRepository.storeContent(
      userId,
      documentId,
      contentId,
      encryptedContent,
    );
    return contentId;
  },

  // Encrypts and stores updated metadata for an EXISTING document. Pass the
  // `etag` the document was loaded with (Document.etag) so a concurrent change
  // is rejected with PreconditionFailedError instead of silently overwritten.
  updateDocumentMetadata: async (
    userId: string,
    documentId: string,
    documentKey: JsonWebKey,
    metadata: Record<string, unknown>,
    etag?: string | null,
  ): Promise<string | null> => {
    const payloadBuffer = new TextEncoder().encode(
      JSON.stringify(metadata),
    ).buffer;
    const [encryptedMetadata] = await cryptoService.encryptDocument(
      documentKey,
      [payloadBuffer],
    );
    // Returns the document's new ETag so the caller can keep saving without a
    // re-read (the server 412s a second save that still carries the old one).
    return documentRepository.updateDocumentMetadata(
      userId,
      documentId,
      encryptedMetadata,
      etag,
    );
  },

  getSettings: async (
    user: UserId,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Settings> => {
    const settingsDocResponse = await documentRepository.loadDocument(
      user,
      user,
    );
    const encryptedSettingsDocument = settingsDocResponse.content;

    const encryptedDocumentKey = await documentRepository.loadKey(
      user,
      user,
      "0",
    );
    const decryptedSettingsKey = await cryptoService.decryptKey(
      encryptedDocumentKey.sharedKey,
      publicKey,
      privateKey,
    );

    let documents: string | undefined;
    let chats: string | undefined;
    let profile: string | undefined;
    if (encryptedSettingsDocument.byteLength > 0) {
      const decryptedSettingsDocument = await cryptoService.decryptDocument(
        decryptedSettingsKey,
        encryptedSettingsDocument,
      );
      const payload = JSON.parse(
        new TextDecoder().decode(decryptedSettingsDocument),
      );
      documents = payload.documents;
      chats = payload.chats;
      profile = payload.profile;
    }

    if (!documents || !chats || !profile) {
      throw new Error("Settings document is missing required IDs");
    }

    return { documents, chats, profile, settingsKey: decryptedSettingsKey };
  },

  // See loadKey() above re: `parentFolderKey` doubling as "the other
  // party's public key" and `privateKey` when the key entry is ECDH- rather
  // than folder-wrapped.
  loadDocument: async (
    user: UserId,
    documentId: string,
    parentFolderId: string,
    parentFolderKey: JsonWebKey,
    privateKey?: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    try {
      const documentsResponse = await documentRepository.loadDocument(
        user,
        documentId,
      );
      const encryptedDocument = documentsResponse.content;
      const encryptedDocumentKey = await documentRepository.loadKey(
        user,
        documentId,
        parentFolderId,
      );
      const decryptedDocumentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        parentFolderKey,
        privateKey,
      );
      const document = await decryptDocument(
        documentId,
        encryptedDocument,
        encryptedDocumentKey,
        decryptedDocumentKey,
      );
      // `user` is the account whose tree this document lives in - keep it so
      // later content fetches (loadContent) hit the right namespace even for
      // a document viewed via a chat share, where the key envelope's issuer
      // is the recipient, not the owner.
      document.owner = user;
      // Carry the ETag so a later read-modify-write of this document (adding a
      // child to a folder, a new contact to the "chats" document, ...) can send
      // it as a precondition and detect a concurrent change.
      document.etag = documentsResponse.etag ?? undefined;
      return document;
    } catch (e) {
      console.error("loadDocument failed for " + documentId, e);
    }
    // A discriminable failure placeholder: enough for a read path to render
    // *something*, but deliberately without `key`/`documents`/`etag` and
    // flagged so a writer refuses to treat it as an up-to-date folder base.
    return {
      documentId: documentId,
      name: "Encrypted Document",
      owner: user,
      emails: [],
      loadFailed: true,
    };
  },
  // Loads a folder document and then every non-folder child it references, in
  // parallel, dropping folders and failed-load placeholders. Returns `[]` if
  // the folder itself has no key (e.g. it failed to load). Used wherever a
  // page needs "the images in this folder" - the activity feed, the chat
  // document picker.
  loadFolderChildren: async (
    user: UserId,
    folderId: string,
    folderParentId: string,
    folderParentKey: JsonWebKey,
  ): Promise<DocumentMetadata[]> => {
    const folder = await documentService.loadDocument(
      user,
      folderId,
      folderParentId,
      folderParentKey,
    );
    if (!folder.key || !folder.documents) {
      return [];
    }
    const folderKey = folder.key;
    const children = await Promise.all(
      folder.documents.map((childId) =>
        documentService.loadDocument(user, childId, folderId, folderKey),
      ),
    );
    return children.filter(
      (child) => !child.loadFailed && child.type?.toLowerCase() !== "folder",
    );
  },
  // Loads and decrypts a single file belonging to `document`. Defaults to
  // the document's preview image; pass `contentId` for a specific file
  // (e.g. a profile picture). Pass `folder` (its id + symmetric key) when
  // `document.key` isn't already populated - the document key is then
  // fetched and unwrapped via that folder's key entry.
  loadContent: async (
    user: UserId,
    document: DocumentMetadata,
    contentId?: string,
    folder?: { id: string; key: JsonWebKey },
  ): Promise<ArrayBuffer> => {
    // `document.owner` (stamped by loadDocument) is the account whose tree
    // the document lives in - use it for the content URL rather than `user`
    // (who is merely asking); the two differ when viewing a chat share.
    const owner = document.owner ?? user;
    let documentKey = document.key;
    if (!documentKey) {
      if (!folder) {
        throw new Error("Either document.key or folder is required");
      }
      const encryptedDocumentKey = await documentRepository.loadKey(
        owner,
        document.documentId,
        folder.id,
      );
      documentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        folder.key,
      );
    }
    const fileId = contentId ?? document.previewImageId;
    if (!fileId) {
      throw new Error("Document has no preview image and no contentId given");
    }
    const { content } = await documentRepository.loadContent(
      owner,
      document.documentId,
      fileId,
    );
    return cryptoService.decryptDocument(documentKey, content);
  },
  // Sharing a document with a contact is structurally the same operation
  // as adding it to any other folder: the document's own symmetric key gets
  // a second keys/{kid} entry, this time wrapped with the chat's shared key
  // (the chat Document's own key, see ContactService.loadChatKey) instead
  // of a folder's. The recipient's userId is used as "kid" so they can find
  // their own copy the same way they'd find a folder-shared one, and as the
  // issuer so the entry grants them the "member" role on this document -
  // they can still decrypt it, as they hold the same chat key.
  shareDocument: async (
    user: string,
    document: DocumentMetadata,
    contactUserId: string,
    chatKey: JsonWebKey,
  ): Promise<void> => {
    if (!document.key) {
      throw new Error("Document key not found");
    }
    const encryptedKey = await cryptoService.encryptKey(document.key, chatKey);
    await documentRepository.storeSharedKey(user, document.documentId, {
      issuer: contactUserId,
      kid: contactUserId,
      sharedKey: encryptedKey,
    });
  },
};

// Re-fetches and decrypts a folder document whose symmetric key we already
// hold, returning just what storeDocument needs to re-apply its change after a
// concurrent-modification 412: the current child list and the current ETag.
async function reloadFolderDocuments(
  owner: string,
  folderId: string,
  folderKey: JsonWebKey,
): Promise<{ documents?: string[]; etag: string | null }> {
  const { content, etag } = await documentRepository.loadDocument(
    owner,
    folderId,
  );
  const decrypted = await cryptoService.decryptDocument(folderKey, content);
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  return { documents: payload.documents, etag };
}

export async function decryptDocument(
  documentId: string,
  encryptedMetadata: ArrayBuffer,
  encryptedKey: {
    issuer: string;
    kid: string;
    sharedKey: string;
  },
  decryptedDocumentKey: JsonWebKey,
): Promise<Document> {
  const decryptedMetadataBuffer = await cryptoService.decryptDocument(
    decryptedDocumentKey,
    encryptedMetadata,
  );
  const payloadText = new TextDecoder().decode(decryptedMetadataBuffer);
  const payload = JSON.parse(payloadText);
  return {
    documentId: documentId,
    name: payload.name,
    type: payload.type,
    size: payload.size,
    contentId: payload.contentId,
    smallImageId: payload.smallImageId,
    previewImageId: payload.previewImageId,
    documents: payload.documents,
    emails: payload.emails,
    profilePictureId: payload.profilePictureId,
    contacts: payload.contacts,
    avatarId: payload.avatarId,
    publicProfiles: payload.publicProfiles,
    publicProfileId: payload.publicProfileId,
    sharedKey: encryptedKey,
    key: decryptedDocumentKey,
  };
}
