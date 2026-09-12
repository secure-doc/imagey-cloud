import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { Settings } from "../contexts/AuthenticationContext";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata, {
  BaseMetadata,
  FolderEntry,
  FolderMetadata,
  NewDocumentMetadata,
} from "./DocumentMetadata";
import {
  documentRepository,
  PreconditionFailedError,
} from "./DocumentRepository";

// How often storeDocument re-reads the parent folder and retries after the
// server rejected the upload because the folder changed concurrently.
const MAX_FOLDER_UPDATE_RETRIES = 3;

// Thrown by loadDocument (and anything built on it) when a document could
// not be fetched or decrypted - a network failure, a wrong/missing key, or
// corrupt/unexpected content. Callers that want a document load to be
// non-fatal (e.g. "show initials instead of an avatar") catch this
// explicitly rather than relying on a placeholder sentinel value.
export class DocumentLoadError extends Error {
  constructor(
    public readonly documentId: string,
    public readonly cause?: unknown,
  ) {
    super(`Failed to load document ${documentId}`);
    this.name = "DocumentLoadError";
  }
}

// The result of adding a child (document or sub-folder) to a folder: the new
// child's metadata plus the parent folder's state *after* the write - its full
// document list (which, after a concurrent-change retry, also picks up whatever
// siblings were added meanwhile) and its new revision - so the caller can keep
// its in-memory folder fresh for the next change without a re-fetch.
export interface StoreResult {
  document: NewDocumentMetadata;
  parentFolderDocuments: FolderEntry[];
  parentFolderRevision: string | null;
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
    accessPath?: string,
  ): Promise<JsonWebKey> => {
    const key = await documentRepository.loadKey(
      userId,
      documentId,
      kid,
      accessPath,
    );
    return cryptoService.decryptKey(key.sharedKey, wrappingKey, privateKey);
  },
  storeFolder: async (
    userId: string,
    name: string,
    parentFolder: Document<FolderMetadata>,
    parentFolderKey: JsonWebKey,
    // Access-Path chain for contributing into a contact's shared folder reached
    // transitively (ADR 0009); omit when the folder is your own or shared with
    // you directly.
    accessPath?: string,
  ): Promise<StoreResult> => {
    const file = new File([], name, { type: "Folder" });
    return documentService.storeDocument(
      userId,
      file,
      parentFolder,
      parentFolderKey,
      accessPath,
    );
  },

  storeDocument: async (
    userId: string,
    file: File,
    parentFolder: Document<FolderMetadata>,
    parentFolderKey: JsonWebKey,
    // Access-Path chain for contributing into a contact's shared folder reached
    // transitively (ADR 0009); omit when the folder is your own or shared with
    // you directly.
    accessPath?: string,
  ): Promise<StoreResult> => {
    // The File/Blob spec ASCII-lowercases `type`, so storeFolder's
    // `new File([], name, { type: "Folder" })` arrives here as "folder"
    // regardless of how it was spelled at the call site.
    const isFolder = file.type.toLowerCase() === "folder";
    const buffers: ArrayBuffer[] = isFolder ? [] : [await file.arrayBuffer()];
    const documentKey = await cryptoService.generateSymmetricKey();
    const documentId = cryptoService.generateUuid();
    const contentId = isFolder ? undefined : cryptoService.generateUuid();
    // The parent folder may belong to someone who shared it with us; its key is theirs, so the new
    // document's key entry is issued by them, and its content update goes to their tree.
    const folderOwner = parentFolder.owner ?? userId;

    let documentMetadata: NewDocumentMetadata;
    let folderEntryBase: Omit<FolderEntry, "sharedKey">;
    if (isFolder) {
      documentMetadata = {
        documentId,
        name: file.name,
        owner: folderOwner,
        key: documentKey,
        type: "folder",
        documents: [],
      };
      folderEntryBase = { documentId, name: file.name, type: "folder" };
    } else if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      const smallImageId = cryptoService.generateUuid();
      const mediumImageId = cryptoService.generateUuid();
      documentMetadata = {
        documentId,
        name: file.name,
        owner: folderOwner,
        key: documentKey,
        type: "image",
        mimeType: file.type,
        size: file.size,
        contentId: contentId as string,
        smallImageId,
        mediumImageId,
      };
      folderEntryBase = {
        documentId,
        name: file.name,
        type: "image",
        mimeType: file.type,
        mediumImageId,
      };
    } else {
      documentMetadata = {
        documentId,
        name: file.name,
        owner: folderOwner,
        key: documentKey,
        type: "file",
        mimeType: file.type,
        size: file.size,
        contentId: contentId as string,
      };
      folderEntryBase = {
        documentId,
        name: file.name,
        type: "file",
        mimeType: file.type,
      };
    }

    const encryptedContent = await cryptoService.encryptDocument(documentKey, [
      new TextEncoder().encode(JSON.stringify(documentMetadata)).buffer,
      ...buffers,
    ]);
    const files: { filename: string; buffer: ArrayBuffer }[] = [];
    if (contentId) {
      files.push({ filename: contentId, buffer: encryptedContent[1] });
    }
    if (documentMetadata.type === "image") {
      files.push({
        filename: documentMetadata.smallImageId,
        buffer: encryptedContent[2],
      });
      files.push({
        filename: documentMetadata.mediumImageId,
        buffer: encryptedContent[3],
      });
    }

    // Adding the document to the folder is a read-modify-write of the folder's
    // (encrypted, so un-mergeable server-side) document list. If the folder
    // changed since we loaded it - e.g. a sibling upload, or another device -
    // the server rejects the upload with 412; we then re-read the folder,
    // re-apply our addition and retry so the concurrent change is not lost.
    let currentDocuments = parentFolder.documents;
    let currentRevision: string | null = parentFolder.revision;
    for (let attempt = 1; attempt <= MAX_FOLDER_UPDATE_RETRIES; attempt++) {
      // The wrapped child key, symmetric under the folder's OWN key - reused
      // both as the document's server-side key envelope entry below and as
      // the FolderEntry's own sharedKey, so a later folder listing can
      // unwrap it locally with no extra request.
      const encryptedKey = await cryptoService.encryptKey(
        documentKey,
        parentFolderKey,
      );
      const newEntry: FolderEntry = {
        ...folderEntryBase,
        sharedKey: { sharedKey: encryptedKey },
      };
      const newDocuments = [...currentDocuments, newEntry];
      // The folder's own revision is a wire-level precondition, not part of
      // its stored content - never embed it in the payload being encrypted.
      const folderForUpload = {
        documentId: parentFolder.documentId,
        name: parentFolder.name,
        owner: parentFolder.owner,
        key: parentFolder.key,
        type: parentFolder.type,
        documents: newDocuments,
      };
      const newEncryptedParent = await cryptoService.encryptDocument(
        parentFolderKey,
        [new TextEncoder().encode(JSON.stringify(folderForUpload)).buffer],
      );
      try {
        const { folderETag } = await documentRepository.uploadDocument(
          userId,
          folderOwner,
          parentFolder.documentId,
          newEncryptedParent[0],
          currentRevision,
          documentId,
          encryptedContent[0],
          {
            issuer: folderOwner,
            kid: parentFolder.documentId,
            sharedKey: encryptedKey,
          },
          files,
          accessPath,
        );
        return {
          document: documentMetadata,
          parentFolderDocuments: newDocuments,
          parentFolderRevision: folderETag,
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
          accessPath,
        );
        currentDocuments = reloaded.documents;
        currentRevision = reloaded.revision;
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
  // revision the document was loaded with (DocumentMetadata.revision) so a
  // concurrent change is rejected with PreconditionFailedError instead of
  // silently overwritten.
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
  // than folder-wrapped. Rejects with DocumentLoadError (rather than
  // resolving with a placeholder) on any failure - a network error, a wrong
  // key, or unexpected/corrupt content.
  loadDocument: async (
    user: UserId,
    documentId: string,
    parentFolderId: string,
    parentFolderKey: JsonWebKey,
    privateKey?: JsonWebKey,
    // The Access-Path chain header for a document reached through a contact's
    // shared folder (ADR 0009); omit for own-tree or direct-grant access.
    accessPath?: string,
  ): Promise<DocumentMetadata> => {
    try {
      const documentsResponse = await documentRepository.loadDocument(
        user,
        documentId,
        accessPath,
      );
      const encryptedDocumentKey = await documentRepository.loadKey(
        user,
        documentId,
        parentFolderId,
        accessPath,
      );
      const decryptedDocumentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        parentFolderKey,
        privateKey,
      );
      // `user` is the account whose tree this document lives in - keep it so
      // later content fetches (loadContent) hit the right namespace even for
      // a document viewed via a chat share, where the key envelope's issuer
      // is the recipient, not the owner. A missing ETag (the server always
      // sends one; only relevant if it somehow didn't) falls back to "" -
      // falsy, so a later read-modify-write of this document sends no
      // If-Match precondition rather than fabricating a fake revision.
      return await decryptDocument(
        documentId,
        documentsResponse.content,
        decryptedDocumentKey,
        user,
        documentsResponse.etag ?? "",
      );
    } catch (e) {
      console.error("loadDocument failed for " + documentId, e);
      throw new DocumentLoadError(documentId, e);
    }
  },
  // Loads a folder document and then every non-folder child it references, in
  // parallel, dropping folders and children that failed to load. Returns `[]`
  // if the folder itself failed to load. Used wherever a page needs "the
  // images in this folder" - the activity feed, the chat document picker.
  loadFolderChildren: async (
    user: UserId,
    folderId: string,
    folderParentId: string,
    folderParentKey: JsonWebKey,
  ): Promise<DocumentMetadata[]> => {
    let folder: FolderMetadata;
    try {
      const loaded = await documentService.loadDocument(
        user,
        folderId,
        folderParentId,
        folderParentKey,
      );
      if (loaded.type !== "folder") {
        return [];
      }
      folder = loaded;
    } catch {
      return [];
    }
    const folderKey = folder.key;
    // A single failed child must not sink the whole listing - keep whichever
    // siblings loaded successfully instead of rejecting the entire batch.
    const results = await Promise.allSettled(
      folder.documents.map((entry) =>
        documentService.loadDocument(
          user,
          entry.documentId,
          folderId,
          folderKey,
        ),
      ),
    );
    return results
      .filter(
        (result): result is PromiseFulfilledResult<DocumentMetadata> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .filter((child) => child.type !== "folder");
  },
  // Loads and decrypts a single file belonging to `document`. Defaults to
  // the document's medium image; pass `contentId` for a specific file (e.g.
  // a profile picture). Accepts NewDocumentMetadata (not just DocumentMetadata)
  // since a freshly-uploaded, not-yet-reloaded document (unknown `revision`)
  // is otherwise fully usable here - it already has `owner`/`key`.
  loadContent: async (
    document: NewDocumentMetadata,
    contentId?: string,
    accessPath?: string,
  ): Promise<ArrayBuffer> => {
    const fileId =
      contentId ??
      (document.type === "image" ? document.mediumImageId : undefined);
    if (!fileId) {
      throw new Error("Document has no preview image and no contentId given");
    }
    const { content } = await documentRepository.loadContent(
      document.owner,
      document.documentId,
      fileId,
      accessPath,
    );
    return cryptoService.decryptDocument(document.key, content);
  },
  // Fetches and decrypts one FolderEntry's own content (its medium/preview
  // image) directly off the entry embedded in the parent folder - unwraps
  // the entry's own key locally from the folder's key (no network round
  // trip) instead of loading the child document's own metadata+key first.
  loadFolderEntryContent: async (
    folderOwner: string,
    entry: FolderEntry,
    folderKey: JsonWebKey,
    accessPath?: string,
  ): Promise<ArrayBuffer> => {
    if (!entry.mediumImageId) {
      throw new Error(`Folder entry ${entry.documentId} has no medium image`);
    }
    const documentKey = await cryptoService.decryptKey(
      entry.sharedKey.sharedKey,
      folderKey,
    );
    const { content } = await documentRepository.loadContent(
      folderOwner,
      entry.documentId,
      entry.mediumImageId,
      accessPath,
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
    document: Pick<BaseMetadata, "documentId" | "key">,
    contactUserId: string,
    chatKey: JsonWebKey,
  ): Promise<void> => {
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
// concurrent-modification 412: the current child list and the current revision.
async function reloadFolderDocuments(
  owner: string,
  folderId: string,
  folderKey: JsonWebKey,
  accessPath?: string,
): Promise<{ documents: FolderEntry[]; revision: string | null }> {
  const { content, etag } = await documentRepository.loadDocument(
    owner,
    folderId,
    accessPath,
  );
  const decrypted = await cryptoService.decryptDocument(folderKey, content);
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  return { documents: payload.documents ?? [], revision: etag };
}

export async function decryptDocument(
  documentId: string,
  encryptedMetadata: ArrayBuffer,
  decryptedDocumentKey: JsonWebKey,
  owner: string,
  revision: string,
): Promise<Document> {
  const decryptedMetadataBuffer = await cryptoService.decryptDocument(
    decryptedDocumentKey,
    encryptedMetadata,
  );
  const payloadText = new TextDecoder().decode(decryptedMetadataBuffer);
  const payload = JSON.parse(payloadText);
  const base = {
    documentId,
    name: payload.name,
    owner,
    revision,
    key: decryptedDocumentKey,
  };
  switch (payload.type) {
    case "profile":
      return {
        ...base,
        type: "profile",
        emails: payload.emails,
        profileImageId: payload.profileImageId,
        publicProfileId: payload.publicProfileId,
      };
    case "publicProfile":
      return {
        ...base,
        type: "publicProfile",
        avatarId: payload.avatarId,
      };
    case "chatList":
      return {
        ...base,
        type: "chatList",
        contacts: payload.contacts,
      };
    case "chat":
      return {
        ...base,
        type: "chat",
        publicProfiles: payload.publicProfiles,
      };
    case "folder":
      return {
        ...base,
        type: "folder",
        documents: payload.documents,
      };
    case "file":
      return {
        ...base,
        type: "file",
        mimeType: payload.mimeType,
        size: payload.size,
        contentId: payload.contentId,
      };
    case "image":
      return {
        ...base,
        type: "image",
        mimeType: payload.mimeType,
        size: payload.size,
        contentId: payload.contentId,
        smallImageId: payload.smallImageId,
        mediumImageId: payload.mediumImageId,
      };
    default:
      throw new Error(
        `Unknown document type "${payload.type}" for document ${documentId}`,
      );
  }
}
