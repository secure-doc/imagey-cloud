import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import { documentMetadataRepository } from "./DocumentMetadataRepository";
import { documentRepository } from "./DocumentRepository";

export const documentService = {
  storeDocument: async (
    email: string,
    file: File,
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
    const publicKey = await authenticationRepository.loadPublicKey(email);
    const encryptedDocumentKey = await cryptoService.encryptKey(
      documentKey,
      publicKey,
      privateKey,
    );
    await documentRepository.storeKey(email, documentId, encryptedDocumentKey);
    if (imageService.isImage(file.type)) {
      const scaledImages = await imageService.scale(file);
      buffers.push(scaledImages.smallImage);
      buffers.push(scaledImages.normalImage);
      documentMetadata.smallImageId = cryptoService.generateUuid();
      documentMetadata.previewImageId = cryptoService.generateUuid();
      await documentMetadataRepository.createDocumentMetadata(
        email,
        documentMetadata,
      );
      const encryptedDocuments = await cryptoService.encryptDocument(
        documentKey,
        buffers,
      );
      await documentRepository.createDocument(
        email,
        documentMetadata,
        encryptedDocuments,
      );
      return documentMetadata;
    } else {
      await documentMetadataRepository.createDocumentMetadata(
        email,
        documentMetadata,
      );
      const encryptedDocument = await cryptoService.encryptDocument(
        documentKey,
        buffers,
      );
      await documentRepository.createDocument(
        email,
        documentMetadata,
        encryptedDocument,
      );
      return documentMetadata;
    }
  },
  loadDocument: async (
    user: string,
    metadata: DocumentMetadata,
    privateKey: JsonWebKey,
  ): Promise<Document> => {
    const encryptedContent = await documentRepository.loadContent(
      user,
      metadata.documentId,
      metadata.previewImageId ?? metadata.documentId,
    );
    const encryptedDocumentKey = await documentRepository.loadKey(
      user,
      metadata.documentId,
    );
    const publicKey = await authenticationRepository.loadPublicKey(user);
    try {
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
    privateKey: JsonWebKey,
  ): Promise<Document[]> => {
    const metadata = await documentRepository.loadDocuments(user);
    return Promise.all(
      metadata.map((meta) =>
        documentService.loadDocument(user, meta, privateKey),
      ),
    );
  },
};
