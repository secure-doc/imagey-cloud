import {
  base64ToArrayBuffer,
  cryptoService,
} from "../authentication/CryptoService";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import { documentRepository } from "./DocumentRepository";
import { EncryptedDocumentContent } from "./EncryptedDocumentContent";
import { Settings } from "../contexts/AuthenticationContext";
import { UserId } from "../authentication/UserId";

export const documentService = {
  loadKey: async (
    email: string,
    documentId: string,
    kid: string,
    parentKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const key = await documentRepository.loadKey(email, documentId, kid);
    return cryptoService.decryptKey(
      base64ToArrayBuffer(key.sharedKey),
      parentKey,
    );
  },
  storeFolder: async (
    email: string,
    name: string,
    parentFolderId: string,
    parentFolderKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const file = new File([], name, { type: "Folder" });
    return documentService.storeDocument(
      email,
      file,
      parentFolderId,
      parentFolderKey,
    );
  },

  storeDocument: async (
    email: string,
    file: File,
    parentFolderId: string,
    parentFolderKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    if (!parentFolderId || !parentFolderKey) {
      throw new Error(
        "parentFolderId and parentFolderKey are required to upload a document.",
      );
    }

    const documentId = cryptoService.generateUuid();
    const documentKey = await cryptoService.generateSymmetricKey();

    const documentMetadata: DocumentMetadata = {
      documentId,
      name: file.name,
      type: file.type,
      size: file.size,
      key: documentKey,
    };

    const buffers: ArrayBuffer[] =
      file.size > 0 ? [await file.arrayBuffer()] : [];

    if (file.size > 0) {
      documentMetadata.contentId = cryptoService.generateUuid();
    }

    if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      documentMetadata.smallImageId = cryptoService.generateUuid();
      documentMetadata.previewImageId = cryptoService.generateUuid();
    }

    const encryptedDocumentKeyString = await cryptoService.encryptMessage(
      JSON.stringify(documentKey),
      parentFolderKey,
    );
    const encryptedDocumentKey = {
      issuer: parentFolderId,
      kid: "0",
      sharedKey: encryptedDocumentKeyString,
    };

    const payload = JSON.stringify({
      name: documentMetadata.name,
      type: documentMetadata.type,
      size: documentMetadata.size,
      contentId: documentMetadata.contentId,
      smallImageId: documentMetadata.smallImageId,
      previewImageId: documentMetadata.previewImageId,
      documents: file.type === "Folder" ? [] : undefined,
    });

    const payloadBuffer = new TextEncoder().encode(payload).buffer;
    const encryptedPayload = await cryptoService.encryptDocument(documentKey, [
      payloadBuffer,
    ]);

    const encryptedDocuments = await cryptoService.encryptDocument(
      documentKey,
      buffers,
    );

    const filesToUpload: { filename: string; buffer: ArrayBuffer }[] = [];
    if (encryptedDocuments.length > 0 && documentMetadata.contentId) {
      filesToUpload.push({
        filename: documentMetadata.contentId,
        buffer: encryptedDocuments[0],
      });
    }
    if (encryptedDocuments.length > 1) {
      filesToUpload.push({
        filename: documentMetadata.smallImageId!,
        buffer: encryptedDocuments[1],
      });
      filesToUpload.push({
        filename: documentMetadata.previewImageId!,
        buffer: encryptedDocuments[2],
      });
    }

    // Load parent folder to append document
    const { metadata: parentFolderMetadata } =
      await documentRepository.loadDocument(email, parentFolderId);

    let parentDocuments: string[] = [];
    let parentPayload: { documents?: string[]; [key: string]: unknown } = {};
    if (parentFolderMetadata && parentFolderMetadata.byteLength > 0) {
      const decryptedMetadataBuffer = await cryptoService.decryptDocument(
        parentFolderKey,
        parentFolderMetadata,
      );
      const jsonText = new TextDecoder().decode(decryptedMetadataBuffer);
      try {
        parentPayload = JSON.parse(jsonText);
        if (Array.isArray(parentPayload.documents))
          parentDocuments = parentPayload.documents;
      } catch {
        // Ignore parse error
      }
    }
    parentDocuments.push(documentId);
    parentPayload.documents = parentDocuments;

    const newParentFolderPayload = JSON.stringify(parentPayload);
    const newParentFolderBuffer = new TextEncoder().encode(
      newParentFolderPayload,
    ).buffer;
    const encryptedParentFolder = await cryptoService.encryptDocument(
      parentFolderKey,
      [newParentFolderBuffer],
    );

    await documentRepository.uploadDocument(
      email,
      parentFolderId,
      encryptedParentFolder[0],
      documentId,
      encryptedPayload[0],
      encryptedDocumentKey,
      filesToUpload,
    );

    return documentMetadata;
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
    const settingsDocMetadata = settingsDocResponse.metadata;

    let documentListId: string | undefined = undefined;
    let chatListId: string | undefined = undefined;
    let profileId: string | undefined = undefined;

    const encryptedDocumentKey = await documentRepository.loadKey(
      user,
      user,
      "0",
    );

    const decryptedSettingsKey = await cryptoService.decryptKey(
      base64ToArrayBuffer(encryptedDocumentKey.sharedKey),
      publicKey,
      privateKey,
    );

    if (settingsDocMetadata.byteLength > 0) {
      const decryptedMetadataBuffer = await cryptoService.decryptDocument(
        decryptedSettingsKey,
        settingsDocMetadata,
      );
      const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
      const payload = JSON.parse(metadataJson);
      documentListId = payload.documents || payload.documentListId;
      chatListId = payload.chats || payload.chatListId;
      profileId = payload.profile || payload.profileId;
    }

    if (!documentListId || !chatListId || !profileId) {
      throw new Error("Settings document is missing required IDs");
    }

    return {
      documents: documentListId,
      chats: chatListId,
      profile: profileId,
      settingsKey: decryptedSettingsKey,
    };
  },

  getFolder: async (
    user: string,
    folderId: string,
    decryptedSettingsKey: JsonWebKey,
  ): Promise<Document> => {
    const folderMetadata = (
      await documentRepository.loadDocument(user, folderId)
    ).metadata;

    const encryptedFolderKey = await documentRepository.loadKey(user, folderId);

    const folderKeyJson = await cryptoService.decryptMessage(
      encryptedFolderKey.sharedKey,
      decryptedSettingsKey,
    );
    const folderKey = JSON.parse(folderKeyJson) as JsonWebKey;

    return await decryptDocumentContent(
      user,
      await decryptDocumentMetadata(
        folderId,
        folderMetadata,
        encryptedFolderKey,
        folderKey,
      ),
      folderKey,
    );
  },

  loadDocument: async (
    user: string,
    documentId: string,
    parentFolderId: string,
    parentFolderKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    try {
      const metadataResponse = await documentRepository.loadDocument(
        user,
        documentId,
      );
      const encryptedMetadata = metadataResponse.metadata;
      const encryptedDocumentKey = await documentRepository.loadKey(
        user,
        documentId,
        parentFolderId,
      );
      const decryptedDocumentKey = await cryptoService.decryptKey(base64ToArrayBuffer(encryptedDocumentKey.sharedKey), parentFolderKey);
      return await decryptDocumentMetadata(
        documentId,
        encryptedMetadata,
        encryptedDocumentKey,
        decryptedDocumentKey,
      );
    } catch (e) {
      console.error("loadDocument failed for", documentId, e);
    }
    return {
      documentId: documentId,
      name: "Encrypted Document",
    };
  },
  loadSharedDocument: async (
    owner: string,
    documentId: string,
    chatKey: JsonWebKey,
    recipient: string,
  ): Promise<Document> => {
    try {
      const metadataResponse = await documentRepository.loadDocument(
        owner,
        documentId,
      );
      const encryptedMetadata = metadataResponse.metadata;
      const encryptedDocumentKey = await documentRepository.loadKey(
        owner,
        documentId,
        recipient,
      );

      const docKeyStr = await cryptoService.decryptMessage(
        encryptedDocumentKey.sharedKey,
        chatKey,
      );
      const decryptedDocumentKey = JSON.parse(docKeyStr) as JsonWebKey;

      const documentMetadata = await decryptDocumentMetadata(
        documentId,
        encryptedMetadata,
        encryptedDocumentKey,
        decryptedDocumentKey,
      );

      return await decryptDocumentContent(
        owner,
        documentMetadata,
        decryptedDocumentKey,
      );
    } catch (e) {
      console.error(e);
    }
    return {
      documentId: documentId,
      name: "Encrypted Document",
    };
  },

  loadFolder: async (
    user: string,
	parentId: string,
	parentKey: JsonWebKey,
    folderId: string
  ): Promise<DocumentMetadata[]> => {
	return [];
  },
  loadDocuments: async (
    user: string,
    documentIds: string[],
    parentFolderId: string,
    folderKey: JsonWebKey,
  ): Promise<DocumentMetadata[]> => {
    const results = await Promise.allSettled(
      documentIds.map((id) =>
        documentService.loadDocument(user, id, parentFolderId, folderKey),
      ),
    );
    return results
      .filter(
        (r): r is PromiseFulfilledResult<DocumentMetadata> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
  },
  shareDocument: async (
    user: string,
    document: DocumentMetadata,
    contactEmail: string,
    chatKey: JsonWebKey,
  ): Promise<void> => {
    if (!document.key) throw new Error("Document key not found");
    const docKeyStr = JSON.stringify(document.key);
    const newEncryptedDocumentKeyString = await cryptoService.encryptMessage(
      docKeyStr,
      chatKey,
    );

    const newEncryptedDocumentKey = {
      issuer: user,
      kid: "0",
      sharedKey: newEncryptedDocumentKeyString,
    };
    await documentRepository.storeSharedKey(
      user,
      document.documentId,
      contactEmail,
      newEncryptedDocumentKey,
    );
  },
  loadDocumentContent: async (
    user: string,
    metadata: DocumentMetadata,
    encryptedKey?: {
      issuer: string;
      kid: string;
      sharedKey: string;
    },
    folderKey?: JsonWebKey,
    parentFolderId?: string,
  ): Promise<Document> => {
    try {
      let decryptedDocumentKey: JsonWebKey;
      if (metadata.key) {
        decryptedDocumentKey = metadata.key;
      } else {
        const encryptedDocumentKey =
          encryptedKey ??
          metadata.sharedKey ??
          (await documentRepository.loadKey(
            user,
            metadata.documentId!,
            parentFolderId,
          ));

        if (!folderKey) {
          throw new Error(
            "Folder key must be provided if metadata.key is not present",
          );
        }
        decryptedDocumentKey = JSON.parse(
          await cryptoService.decryptMessage(
            encryptedDocumentKey.sharedKey,
            folderKey,
          ),
        );
      }
      return await decryptDocumentContent(user, metadata, decryptedDocumentKey);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  addDocumentToFolder: async (
    email: string,
    folderId: string,
    folderKey: JsonWebKey,
    documentId: string,
  ): Promise<void> => {
    let success = false;
    let attempts = 0;
    while (!success && attempts < 5) {
      attempts++;
      try {
        const { metadata, etag } = await documentRepository.loadDocument(
          email,
          folderId,
        );

        let array: string[] = [];
        let payload: { documents?: string[]; [key: string]: unknown } = {};
        if (metadata && metadata.byteLength > 0) {
          const decryptedMetadataBuffer = await cryptoService.decryptDocument(
            folderKey,
            metadata,
          );
          const jsonText = new TextDecoder().decode(decryptedMetadataBuffer);
          try {
            payload = JSON.parse(jsonText);
            if (Array.isArray(payload.documents)) array = payload.documents;
          } catch {
            // Ignore parse error
          }
        }

        if (!array.includes(documentId)) {
          array.push(documentId);
        }

        payload.documents = array;
        const newJsonText = JSON.stringify(payload);
        const newPayloadBuffer = new TextEncoder().encode(newJsonText).buffer;

        const newEncryptedPayload = await cryptoService.encryptDocument(
          folderKey,
          [newPayloadBuffer],
        );

        await documentRepository.updateDocumentMetadata(
          email,
          folderId,
          newEncryptedPayload[0],
          etag ?? undefined,
        );
        success = true;
      } catch (e: unknown) {
        if (e instanceof Error && e.message && e.message.includes("412")) {
          // Precondition failed, retry
          continue;
        }
        throw e;
      }
    }
    if (!success) {
      throw new Error(
        "Failed to add document to folder after multiple attempts due to concurrent modifications.",
      );
    }
  },
};

export async function decryptDocumentMetadata(
  documentId: string,
  encryptedMetadata: EncryptedDocumentContent,
  encryptedKey: {
    issuer: string;
    kid: string;
    sharedKey: string;
  },
  decryptedDocumentKey: JsonWebKey,
): Promise<DocumentMetadata> {
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
    sharedKey: encryptedKey,
    key: decryptedDocumentKey,
  };
}
async function decryptDocumentContent(
  owner: string,
  metadata: DocumentMetadata,
  decryptedDocumentKey: JsonWebKey,
): Promise<Document> {
  let decryptedContent: ArrayBuffer | undefined = undefined;
  let etag: string | undefined = undefined;
  if (
    metadata.type?.toLowerCase() === "folder" ||
    metadata.type?.toLowerCase() === "chat"
  ) {
    return {
      content: undefined,
      documentId: metadata.documentId!,
      name: metadata.name!,
      type: metadata.type,
      key: decryptedDocumentKey,
      documents: metadata.documents,
    };
  }
  try {
    console.log(
      `loading content with id ${metadata.contentId} for ${metadata.type} and id ${metadata.documentId} and preview image id ${metadata.previewImageId}`,
    );
    const encryptedContentResponse = await documentRepository.loadContent(
      owner,
      metadata.documentId!,
      metadata.contentId ?? metadata.previewImageId ?? metadata.documentId!,
      metadata.type?.toLowerCase() === "folder",
    );

    etag = encryptedContentResponse.etag ?? undefined;
    decryptedContent = await cryptoService.decryptDocument(
      decryptedDocumentKey,
      encryptedContentResponse.content,
    );
  } catch (e) {
    if (metadata.type?.toLowerCase() !== "folder") {
      console.error("Failed to load content for document", e);
    }
  }

  return {
    content: decryptedContent,
    documentId: metadata.documentId!,
    name: metadata.name!,
    type: metadata.type,
    key: decryptedDocumentKey,
    etag: etag,
  };
}
