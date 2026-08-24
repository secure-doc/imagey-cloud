import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { Settings } from "../contexts/AuthenticationContext";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import { documentRepository } from "./DocumentRepository";
import EncryptedDocumentMetadata from "./EncryptedDocumentMetadata";

export const documentService = {
  loadKey: async (
    email: string,
    documentId: string,
    kid: string,
    parentKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    return Promise.reject();
    /*
	    const key = await documentRepository.loadKey(email, documentId, kid);
    return cryptoService.decryptKey(key.sharedKey, parentKey);
	*/
  },
  storeFolder: async (
    email: string,
    name: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    parentFolderId?: string,
    parentFolderKey?: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    /*
    const file = new File([], name, { type: "Folder" });
    return documentService.storeDocument(
      email,
      file,
      publicKey,
      privateKey,
      parentFolderId,
      parentFolderKey,
    );
	*/
    return Promise.reject();
  },

  storeDocument: async (
    email: string,
    file: File,
    parentFolder: Document,
    parentFolderKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const buffers: ArrayBuffer[] =
      file.size > 0 ? [await file.arrayBuffer()] : [];
    const documentKey = await cryptoService.generateSymmetricKey();
    const documentId = cryptoService.generateUuid();
    const contentId = cryptoService.generateUuid();
    const documentMetadata: DocumentMetadata = {
      documentId: documentId,
      name: file.name,
      type: file.type,
      size: file.size,
      key: documentKey,
      contentId,
    };
    if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      documentMetadata.smallImageId = cryptoService.generateUuid();
      documentMetadata.previewImageId = cryptoService.generateUuid();
    }
    const newDocuments = parentFolder.documents
      ? [...parentFolder.documents, documentId]
      : [documentId];
    const newParentFolder = { ...parentFolder, documents: newDocuments };
    const newEncryptedParent = await cryptoService.encryptDocument(
      parentFolderKey,
      [new TextEncoder().encode(JSON.stringify(newParentFolder)).buffer],
    );
    const encryptedKey = await cryptoService.encryptKey(
      documentKey,
      parentFolderKey,
    );
    const encryptedContent = await cryptoService.encryptDocument(documentKey, [
      new TextEncoder().encode(JSON.stringify(documentMetadata)).buffer,
      ...buffers,
    ]);
    const encryptedDocumentKey = {
      issuer: email,
      kid: parentFolder.documentId,
      sharedKey: encryptedKey,
    };
    const files: { filename: string; buffer: ArrayBuffer }[] = [
      { filename: contentId, buffer: encryptedContent[1] },
    ];
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
    documentRepository.uploadDocument(
      email,
      parentFolder.documentId,
      newEncryptedParent[0],
      documentId,
      encryptedContent[0],
      encryptedDocumentKey,
      files,
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
    const encryptedSettingsDocument = settingsDocResponse.content;

    let documentListId: string | undefined = undefined;
    let chatListId: string | undefined = undefined;
    let profileId: string | undefined = undefined;

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

    if (encryptedSettingsDocument.byteLength > 0) {
      const decryptedSettingsDocument = await cryptoService.decryptDocument(
        decryptedSettingsKey,
        encryptedSettingsDocument,
      );
      const metadataJson = new TextDecoder().decode(decryptedSettingsDocument);
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

  getRootFolder: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Document> => {
    /*
    let settingsDocMetadata;
    try {
      settingsDocMetadata = (
        await documentRepository.loadDocumentMetadata(user, user)
      ).metadata;
    } catch {
      // Doesn't exist yet
    }

    let rootFolderId: string | undefined = undefined;
    let decryptedSettingsKey: JsonWebKey | undefined = undefined;

    if (settingsDocMetadata) {
		console.log(`documentService.getRootFolder(${user}, ${user})`);
      const encryptedDocumentKey =
        settingsDocMetadata.sharedKey ??
        (await documentRepository.loadKey(user, user));

      decryptedSettingsKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        publicKey,
        privateKey,
      );

      if (settingsDocMetadata.metadata) {
        const decryptedMetadataBuffer = await cryptoService.decryptDocument(
          decryptedSettingsKey,
          cryptoService.base64ToArrayBuffer(settingsDocMetadata.metadata),
        );
        const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
        const payload = JSON.parse(metadataJson);
        rootFolderId = payload.documents;
      }
    }

    if (!rootFolderId || !decryptedSettingsKey) {
      decryptedSettingsKey = await cryptoService.generateSymmetricKey();
      const rootFolderKey = await cryptoService.generateSymmetricKey();
      rootFolderId = cryptoService.generateUuid();

      const rootFolderPayload = JSON.stringify({
        name: "Images",
        type: "Folder",
        documents: [],
      });
      const rootFolderPayloadBuffer = new TextEncoder().encode(
        rootFolderPayload,
      ).buffer;
      const encryptedRootFolderPayload = await cryptoService.encryptDocument(
        rootFolderKey,
        [rootFolderPayloadBuffer],
      );

      const encryptedRootFolderKey = await cryptoService.encryptMessage(
        JSON.stringify(rootFolderKey),
        decryptedSettingsKey,
      );

      const rootFolderFormData = new FormData();
      rootFolderFormData.append(
        "metadata",
        new Blob([encryptedRootFolderPayload[0]], {
          type: "application/octet-stream",
        }),
      );
      rootFolderFormData.append(
        "key",
        new Blob([cryptoService.base64ToArrayBuffer(encryptedRootFolderKey)], {
          type: "application/octet-stream",
        }),
        "key",
      );
      rootFolderFormData.append("issuer", user);

      await fetch(`/users/${user}/documents/${rootFolderId}`, {
        method: "PUT",
        body: rootFolderFormData,
      });

      const settingsPayload = JSON.stringify({ documents: rootFolderId });
      const settingsPayloadBuffer = new TextEncoder().encode(
        settingsPayload,
      ).buffer;
      const encryptedSettingsPayload = await cryptoService.encryptDocument(
        decryptedSettingsKey,
        [settingsPayloadBuffer],
      );
      const encryptedSettingsKeyStr = await cryptoService.encryptKey(
        decryptedSettingsKey,
        publicKey,
        privateKey,
      );

      const settingsFormData = new FormData();
      settingsFormData.append(
        "metadata",
        new Blob([encryptedSettingsPayload[0]], {
          type: "application/octet-stream",
        }),
      );
      settingsFormData.append(
        "key",
        new Blob([cryptoService.base64ToArrayBuffer(encryptedSettingsKeyStr)], {
          type: "application/octet-stream",
        }),
        "key",
      );
      settingsFormData.append("issuer", user);

      await fetch(`/users/${user}/documents/${user}`, {
        method: "PUT",
        body: settingsFormData,
      });

      return {
        documentId: rootFolderId,
        name: "Images",
        type: "Folder",
        documents: [],
        key: rootFolderKey,
      } as Document;
    }

    const rootFolderMetadata = (
      await documentRepository.loadDocumentMetadata(user, rootFolderId)
    ).metadata;

	console.log(`documentService.getRootFolder2(${user}, ${rootFolderId})`);
    const encryptedRootFolderKey =
      rootFolderMetadata.sharedKey ??
      (await documentRepository.loadKey(user, rootFolderId));

    const rootFolderKeyJson = await cryptoService.decryptMessage(
      encryptedRootFolderKey.sharedKey,
      decryptedSettingsKey,
    );
    const rootFolderKey = JSON.parse(rootFolderKeyJson) as JsonWebKey;

    return await decryptDocumentContent(
      user,
      await decryptDocumentMetadata(rootFolderMetadata, rootFolderKey),
      rootFolderKey,
    );
	*/
  },
  loadDocument: async (
    user: UserId,
    documentId: string,
    parentFolderId: string,
    parentFolderKey: JsonWebKey,
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
      );
      const decryptedDocument = await decryptDocument(
        documentId,
        encryptedDocument,
        encryptedDocumentKey,
        decryptedDocumentKey,
      );
      console.log(
        "key in documentService.loadDocument: " +
          JSON.stringify(decryptedDocument.key),
      );
      return decryptedDocument;
    } catch (e) {
      console.error("loadDocument failed for " + documentId, e);
    }
    return {
      documentId: documentId,
      name: "Encrypted Document",
    };
  },
  loadDocumentFile: async (
    user: string,
    metadata: EncryptedDocumentMetadata,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    parentFolderKey?: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    /*
    try {
		console.log(`documentService.loadDocumentFile(${user}, ${metadata.documentId})`);
      const encryptedDocumentKey =
        metadata.sharedKey ??
        (await documentRepository.loadKey(user, metadata.documentId));
      let decryptedDocumentKey: JsonWebKey;
      let actualParentFolderKey = parentFolderKey;
      if (
        encryptedDocumentKey.kid !== user &&
        encryptedDocumentKey.kid !== "0" &&
        !actualParentFolderKey
      ) {
        const rootFolder = await documentService.getRootFolder(
          user,
          publicKey,
          privateKey,
        );
        if (rootFolder.documentId === encryptedDocumentKey.kid) {
          actualParentFolderKey = rootFolder.key;
        }
      }

      if (
        encryptedDocumentKey.kid !== user &&
        encryptedDocumentKey.kid !== "0" &&
        actualParentFolderKey
      ) {
        decryptedDocumentKey = JSON.parse(
          await cryptoService.decryptMessage(
            encryptedDocumentKey.sharedKey,
            actualParentFolderKey,
          ),
        );
      } else {
        decryptedDocumentKey = await cryptoService.decryptKey(
          encryptedDocumentKey.sharedKey,
          publicKey,
          privateKey,
        );
      }
      return await decryptDocumentMetadata(metadata, decryptedDocumentKey);
    } catch (e) {
      console.error(e);
    }
    return {
      documentId: metadata.documentId,
      name: "Encrypted Document",
    };
	*/
    return Promise.reject();
  },
  loadSharedDocument: async (
    owner: string,
    metadata: EncryptedDocumentMetadata,
    chatKey: JsonWebKey,
    recipient: string,
  ): Promise<Document> => {
    /*
    try {
		console.log(`documentService.loadSharedDocument(${owner}, ${metadata.documentId}, ${recipient})`);
      const encryptedDocumentKey = await documentRepository.loadKey(
        owner,
        metadata.documentId,
        recipient,
      );

      const docKeyStr = await cryptoService.decryptMessage(
        encryptedDocumentKey.sharedKey,
        chatKey,
      );
      const decryptedDocumentKey = JSON.parse(docKeyStr) as JsonWebKey;

      const documentMetadata = await decryptDocumentMetadata(
        metadata,
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
      documentId: metadata.documentId,
      name: "Encrypted Document",
    };
	*/
    return Promise.reject();
  },

  loadDocuments: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    folderId?: string,
    folderKey?: JsonWebKey,
  ): Promise<DocumentMetadata[]> => {
    /*
    const metadata = await documentRepository.loadDocuments(user, folderId);
    const validMetadata = metadata.filter(
      (meta) =>
        meta.documentId !== "profile" &&
        meta.documentId !== "profile-pic-doc-id" &&
        meta.documentId !== user,
    );
    return Promise.all(
      validMetadata.map((meta) =>
        documentService.loadDocumentFile(
          user,
          meta,
          publicKey,
          privateKey,
          folderKey,
        ),
      ),
    );
	*/
    return Promise.reject();
  },
  shareDocument: async (
    user: string,
    document: DocumentMetadata,
    contactEmail: string,
    chatKey: JsonWebKey,
  ): Promise<void> => {
    /*
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
	*/
    return Promise.reject();
  },
  loadDocumentContent: async (
    user: string,
    document: DocumentMetadata,
    folder?: {
      id: string;
      key: JsonWebKey;
    },
  ): Promise<{ content: ArrayBuffer; etag: string | null }> => {
    let documentKey = document.key;
    if (!documentKey) {
      if (!folder) {
        throw Error("Either document.key or folder is required");
      }
      const encryptedDocumentKey = await documentRepository.loadKey(
        user,
        document.documentId,
        folder.id,
      );
      documentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        folder.key,
      );
    }
    return documentRepository.loadContent(
      user,
      document.documentId,
      document.previewImageId!,
    );
  },

  addDocumentToFolder: async (
    email: string,
    folderId: string,
    folderKey: JsonWebKey,
    documentId: string,
  ): Promise<void> => {
    /*
    let success = false;
    let attempts = 0;
    while (!success && attempts < 5) {
      attempts++;
      try {
        const { metadata, etag } =
          await documentRepository.loadDocumentMetadata(email, folderId);

        let array: string[] = [];
        let payload: { documents?: string[]; [key: string]: unknown } = {};
        if (metadata && metadata.metadata) {
          const decryptedMetadataBuffer = await cryptoService.decryptDocument(
            folderKey,
            cryptoService.base64ToArrayBuffer(metadata.metadata),
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
	*/
    return Promise.reject();
  },
};
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
  console.log("decrypting document");
  const decryptedMetadataBuffer = await cryptoService.decryptDocument(
    decryptedDocumentKey,
    encryptedMetadata,
  );
  console.log("decrypted document");
  const payloadText = new TextDecoder().decode(decryptedMetadataBuffer);
  console.log("decoded document");
  const payload = JSON.parse(payloadText);
  console.log("decoded json: " + payload);
  console.log("decryptDocument: " + decryptedDocumentKey);
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

export async function decryptDocumentMetadata(
  metadata: EncryptedDocumentMetadata,
  decryptedDocumentKey: JsonWebKey,
): Promise<DocumentMetadata> {
  if (!metadata.metadata) {
    const unencrypted = metadata as unknown as Record<string, unknown>;
    return {
      documentId: metadata.documentId,
      name: unencrypted.name as string,
      type: unencrypted.type as "Image" | "Folder",
      size: unencrypted.size as number,
      smallImageId: unencrypted.smallImageId as string,
      previewImageId: unencrypted.previewImageId as string,
      documents: unencrypted.documents as string[],
      sharedKey: metadata.sharedKey,
    };
  }

  const encryptedMetadataBuffer = cryptoService.base64ToArrayBuffer(
    metadata.metadata,
  );
  const decryptedMetadataBuffer = await cryptoService.decryptDocument(
    decryptedDocumentKey,
    encryptedMetadataBuffer,
  );
  const payloadText = new TextDecoder().decode(decryptedMetadataBuffer);
  const payload = JSON.parse(payloadText);
  return {
    documentId: metadata.documentId,
    name: payload.name,
    type: payload.type,
    size: payload.size,
    smallImageId: payload.smallImageId,
    previewImageId: payload.previewImageId,
    documents: payload.documents,
    sharedKey: metadata.sharedKey,
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
  if (metadata.type?.toLowerCase() === "folder") {
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
    const encryptedContentResponse = await documentRepository.loadContent(
      owner,
      metadata.documentId!,
      metadata.previewImageId ?? metadata.documentId!,
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
