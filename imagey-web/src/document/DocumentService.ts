import { cryptoService } from "../authentication/CryptoService";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import {
  documentRepository,
  DocumentPatchOperation,
} from "./DocumentRepository";

export const documentService = {
  storeDocument: async (
    email: string,
    file: File,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const buffers: ArrayBuffer[] = [await file.arrayBuffer()];
    const documentId = cryptoService.generateUuid();
    const documentMetadata: DocumentMetadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      documentId: documentId,
    };
    const documentKey = await cryptoService.generateSymmetricKey();
    const encryptedDocumentKeyString = await cryptoService.encryptKey(
      documentKey,
      publicKey,
      privateKey,
    );
    const encryptedDocumentKey = {
      issuer: email,
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
    });
    const payloadBuffer = new TextEncoder().encode(payload).buffer;
    const encryptedPayload = await cryptoService.encryptDocument(documentKey, [
      payloadBuffer,
    ]);

    const uploadMetadata: DocumentMetadata = {
      documentId: documentId,
      smallImageId: documentMetadata.smallImageId,
      previewImageId: documentMetadata.previewImageId,
      encryptedData: cryptoService.arrayBufferToBase64(encryptedPayload[0]),
      sharedKey: encryptedDocumentKey,
    };

    const encryptedDocuments = await cryptoService.encryptDocument(
      documentKey,
      buffers,
    );

    await documentRepository.uploadDocument(
      email,
      uploadMetadata,
      encryptedDocumentKey,
      encryptedDocuments,
    );

    return documentMetadata;
  },
  loadDocument: async (
    user: string,
    metadata: DocumentMetadata,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Document> => {
    try {
      const encryptedDocumentKey =
        metadata.sharedKey ??
        (await documentRepository.loadKey(user, metadata.documentId));
      const decryptedDocumentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        publicKey,
        privateKey,
      );

      let name = metadata.name;
      let previewImageId = metadata.previewImageId;
      let type = metadata.type;
      let documentIds: string[] | undefined = undefined;
      let folderIds: string[] | undefined = undefined;

      if (metadata.encryptedData) {
        const encryptedPayloadBuffer = cryptoService.base64ToArrayBuffer(
          metadata.encryptedData,
        );
        const decryptedPayloadBuffer = await cryptoService.decryptDocument(
          decryptedDocumentKey,
          encryptedPayloadBuffer,
        );
        const payloadText = new TextDecoder().decode(decryptedPayloadBuffer);
        const payload = JSON.parse(payloadText);
        name = payload.name;
        previewImageId = payload.previewImageId;
        type = payload.type;
        documentIds = payload.documentIds;
        folderIds = payload.folderIds;
      }

      const encryptedContent: ArrayBuffer =
        await documentRepository.loadContent(
          user,
          metadata.documentId,
          previewImageId ?? metadata.documentId,
        );

      const decryptedContent = await cryptoService.decryptDocument(
        decryptedDocumentKey,
        encryptedContent,
      );
      return {
        content: decryptedContent,
        documentId: metadata.documentId,
        name: name!,
        type: type,
        documentIds,
        folderIds,
        _metadata: metadata,
      };
    } catch (e) {
      console.error(e);
    }
    return {
      documentId: metadata.documentId,
      name: metadata.name ?? "Encrypted Document",
      _metadata: metadata,
    };
  },
  loadDocuments: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Document[]> => {
    const metadata = await documentRepository.loadDocuments(user);
    const validMetadata = metadata.filter(
      (meta) =>
        meta.documentId !== "profile" &&
        meta.documentId !== "profile-pic-doc-id",
    );
    return Promise.all(
      validMetadata.map((meta) =>
        documentService.loadDocument(user, meta, publicKey, privateKey),
      ),
    );
  },
  createFolder: async (
    email: string,
    name: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const documentId = cryptoService.generateUuid();
    const documentKey = await cryptoService.generateSymmetricKey();
    const encryptedDocumentKeyString = await cryptoService.encryptKey(
      documentKey,
      publicKey,
      privateKey,
    );
    const encryptedDocumentKey = {
      issuer: email,
      kid: "0",
      sharedKey: encryptedDocumentKeyString,
    };

    const payload = JSON.stringify({
      name: name,
      type: "folder",
      documentIds: [],
    });
    const payloadBuffer = new TextEncoder().encode(payload).buffer;
    const encryptedPayload = await cryptoService.encryptDocument(documentKey, [
      payloadBuffer,
    ]);

    const uploadMetadata: DocumentMetadata = {
      documentId: documentId,
      encryptedData: cryptoService.arrayBufferToBase64(encryptedPayload[0]),
      sharedKey: encryptedDocumentKey,
    };

    const encryptedDocuments = await cryptoService.encryptDocument(
      documentKey,
      [new ArrayBuffer(0)], // empty content for folder
    );

    await documentRepository.uploadDocument(
      email,
      uploadMetadata,
      encryptedDocumentKey,
      encryptedDocuments,
    );

    return uploadMetadata;
  },

  updateDocumentMetadata: async (
    email: string,
    document: Document,
    originalMetadata: DocumentMetadata,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<DocumentPatchOperation> => {
    const encryptedDocumentKey =
      originalMetadata.sharedKey ??
      (await documentRepository.loadKey(email, document.documentId));
    const decryptedDocumentKey = await cryptoService.decryptKey(
      encryptedDocumentKey.sharedKey,
      publicKey,
      privateKey,
    );

    const payload = JSON.stringify({
      name: document.name,
      type: document.type,
      size: originalMetadata.size,
      smallImageId: originalMetadata.smallImageId,
      previewImageId: originalMetadata.previewImageId,
      documentIds: document.documentIds,
      folderIds: document.folderIds,
    });

    const payloadBuffer = new TextEncoder().encode(payload).buffer;
    const encryptedPayload = await cryptoService.encryptDocument(
      decryptedDocumentKey,
      [payloadBuffer],
    );

    const newMetadata: DocumentMetadata = {
      ...originalMetadata,
      encryptedData: cryptoService.arrayBufferToBase64(encryptedPayload[0]),
    };

    return {
      op: "replace",
      path: `/${document.documentId}`,
      value: newMetadata,
    };
  },

  addDocumentToFolder: async (
    email: string,
    document: Document,
    folder: Document,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<void> => {
    if (!document._metadata || !folder._metadata) throw new Error("Metadata not found");

    const updatedDocument = { ...document };
    if (!updatedDocument.folderIds?.includes(folder.documentId)) {
      updatedDocument.folderIds = [...(document.folderIds ?? []), folder.documentId];
    }
    
    const updatedFolder = { ...folder };
    if (!updatedFolder.documentIds?.includes(document.documentId)) {
      updatedFolder.documentIds = [...(folder.documentIds ?? []), document.documentId];
    }

    const patchDoc = await documentService.updateDocumentMetadata(email, updatedDocument, document._metadata, publicKey, privateKey);
    const patchFolder = await documentService.updateDocumentMetadata(email, updatedFolder, folder._metadata, publicKey, privateKey);

    await documentRepository.patchDocuments(email, [patchDoc, patchFolder]);
  },
};

if (typeof window !== "undefined") {
  (window as any).documentService = documentService;
}
