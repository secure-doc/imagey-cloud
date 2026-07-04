import { cryptoService } from "../authentication/CryptoService";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import { documentRepository } from "./DocumentRepository";
import EncryptedDocumentMetadata from "./EncryptedDocumentMetadata";

export const documentService = {
  storeFolder: async (
    email: string,
    name: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    parentFolderId?: string,
    parentFolderKey?: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const file = new File([], name, { type: "Folder" });
    return documentService.storeDocument(
      email,
      file,
      publicKey,
      privateKey,
      parentFolderId,
      parentFolderKey,
    );
  },

  storeDocument: async (
    email: string,
    file: File,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    parentFolderId?: string,
    parentFolderKey?: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const buffers: ArrayBuffer[] =
      file.size > 0 ? [await file.arrayBuffer()] : [];
    const documentKey = await cryptoService.generateSymmetricKey();
    const documentMetadata: DocumentMetadata = {
      documentId: "",
      name: file.name,
      type: file.type,
      size: file.size,
      key: documentKey,
    };

    let encryptedDocumentKeyString: string;
    let issuer: string;
    let issuerType: string;

    if (parentFolderId && parentFolderId !== email && parentFolderKey) {
      encryptedDocumentKeyString = await cryptoService.encryptMessage(
        JSON.stringify(documentKey),
        parentFolderKey,
      );
      issuer = parentFolderId;
      issuerType = "FOLDER";
    } else {
      encryptedDocumentKeyString = await cryptoService.encryptKey(
        documentKey,
        publicKey,
        privateKey,
      );
      issuer = email;
      issuerType = "USER";
    }

    const encryptedDocumentKey = {
      issuerType,
      issuer,
      kid: "0",
      sharedKey: encryptedDocumentKeyString,
    };

    if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      documentMetadata.smallImageId = cryptoService.generateUuid();
      documentMetadata.previewImageId = cryptoService.generateUuid();
    }

    const payload = JSON.stringify({
      name: documentMetadata.name,
      type: documentMetadata.type,
      size: documentMetadata.size,
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

    const documentId = await documentRepository.uploadDocument(
      email,
      encryptedPayload[0],
      encryptedDocumentKey,
      encryptedDocuments,
    );

    documentMetadata.documentId = documentId;

    if (parentFolderId && parentFolderId !== email && parentFolderKey) {
      await documentService.addDocumentToFolder(
        email,
        parentFolderId,
        parentFolderKey,
        documentId,
      );
    }
    return documentMetadata;
  },

  getRootFolder: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Document> => {
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
  },

  loadDocument: async (
    user: string,
    metadata: EncryptedDocumentMetadata,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    parentFolderKey?: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    try {
      const encryptedDocumentKey =
        metadata.sharedKey ??
        (await documentRepository.loadKey(user, metadata.documentId));
      let decryptedDocumentKey: JsonWebKey;
      let actualParentFolderKey = parentFolderKey;
      if (
        encryptedDocumentKey.issuerType === "FOLDER" &&
        !actualParentFolderKey
      ) {
        const rootFolder = await documentService.getRootFolder(
          user,
          publicKey,
          privateKey,
        );
        if (rootFolder.documentId === encryptedDocumentKey.issuer) {
          actualParentFolderKey = rootFolder.key;
        }
      }

      if (
        encryptedDocumentKey.issuerType === "FOLDER" &&
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
  },
  loadSharedDocument: async (
    owner: string,
    metadata: EncryptedDocumentMetadata,
    chatKey: JsonWebKey,
    recipient: string,
  ): Promise<Document> => {
    try {
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
  },

  loadDocuments: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    folderId?: string,
    folderKey?: JsonWebKey,
  ): Promise<DocumentMetadata[]> => {
    const metadata = await documentRepository.loadDocuments(user, folderId);
    const validMetadata = metadata.filter(
      (meta) =>
        meta.documentId !== "profile" &&
        meta.documentId !== "profile-pic-doc-id" &&
        meta.documentId !== user,
    );
    return Promise.all(
      validMetadata.map((meta) =>
        documentService.loadDocument(
          user,
          meta,
          publicKey,
          privateKey,
          folderKey,
        ),
      ),
    );
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
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    encryptedKey?: {
      issuerType?: string;
      issuer: string;
      kid: string;
      sharedKey: string;
    },
    folderKey?: JsonWebKey,
  ): Promise<Document> => {
    try {
      let decryptedDocumentKey: JsonWebKey;
      if (metadata.key) {
        decryptedDocumentKey = metadata.key;
      } else {
        const encryptedDocumentKey =
          encryptedKey ??
          metadata.sharedKey ??
          (await documentRepository.loadKey(user, metadata.documentId!));

        if (encryptedDocumentKey.issuerType === "FOLDER" && folderKey) {
          decryptedDocumentKey = JSON.parse(
            await cryptoService.decryptMessage(
              encryptedDocumentKey.sharedKey,
              folderKey,
            ),
          );
        } else {
          decryptedDocumentKey = await cryptoService.decryptKey(
            encryptedDocumentKey.sharedKey,
            publicKey,
            privateKey,
          );
        }
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
  },
};

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
