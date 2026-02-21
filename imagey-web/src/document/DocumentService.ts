import { cryptoService } from "../authentication/CryptoService";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import { documentRepository } from "./DocumentRepository";

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
    const encryptedDocumentKey = await cryptoService.encryptKey(
      documentKey,
      publicKey,
      privateKey,
    );

    if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      documentMetadata.smallImageId = cryptoService.generateUuid();
      documentMetadata.previewImageId = cryptoService.generateUuid();
    }

    const encryptedDocuments = await cryptoService.encryptDocument(
      documentKey,
      buffers,
    );

    await documentRepository.uploadDocument(
      email,
      documentMetadata,
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
      const encryptedContent: ArrayBuffer =
        await documentRepository.loadContent(
          user,
          metadata.documentId,
          metadata.previewImageId ?? metadata.documentId,
        );
      const encryptedDocumentKey = await documentRepository.loadKey(
        user,
        metadata.documentId,
      );
      const decryptedDocumentKey = await cryptoService.decryptKey(
        encryptedDocumentKey,
        publicKey,
        privateKey,
      );
      const decryptedContent = await cryptoService.decryptDocument(
        decryptedDocumentKey,
        encryptedContent,
      );
      return {
        content: decryptedContent,
        documentId: metadata.documentId,
        name: metadata.name,
      };
    } catch (e) {
      console.error(e);
    }
    return {
      documentId: metadata.documentId,
      name: metadata.name,
    };
  },
  loadDocuments: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Document[]> => {
    const metadata = await documentRepository.loadDocuments(user);
    return Promise.all(
      metadata.map((meta) =>
        documentService.loadDocument(user, meta, publicKey, privateKey),
      ),
    );
  },
};
