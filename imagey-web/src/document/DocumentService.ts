import { cryptoService } from "../authentication/CryptoService";
import { imageService } from "../image/ImageService";
import Document from "./Document";
import DocumentMetadata from "./DocumentMetadata";
import { documentRepository } from "./DocumentRepository";
import EncryptedDocumentMetadata from "./EncryptedDocumentMetadata";

export const documentService = {
  storeDocument: async (
    email: string,
    file: File,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    const buffers: ArrayBuffer[] = [await file.arrayBuffer()];
    const documentMetadata: DocumentMetadata = {
      documentId: "",
      name: file.name,
      type: file.type,
      size: file.size,
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
    return documentMetadata;
  },
  loadDocument: async (
    user: string,
    metadata: EncryptedDocumentMetadata,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<DocumentMetadata> => {
    try {
      const encryptedDocumentKey =
        metadata.sharedKey ??
        (await documentRepository.loadKey(user, metadata.documentId));
      const decryptedDocumentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        publicKey,
        privateKey,
      );
      return decryptDocumentMetadata(metadata, decryptedDocumentKey);
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
  ): Promise<DocumentMetadata[]> => {
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
  shareDocument: async (
    user: string,
    documentId: string,
    contactEmail: string,
    userPublicKey: JsonWebKey,
    userPrivateKey: JsonWebKey,
    chatKey: JsonWebKey,
  ): Promise<void> => {
    const encryptedDocumentKey = await documentRepository.loadKey(
      user,
      documentId,
    );
    const decryptedDocumentKey = await cryptoService.decryptKey(
      encryptedDocumentKey.sharedKey,
      userPublicKey,
      userPrivateKey,
    );

    const docKeyStr = JSON.stringify(decryptedDocumentKey);
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
      documentId,
      contactEmail,
      newEncryptedDocumentKey,
    );
  },
  loadDocumentContent: async (
    user: string,
    metadata: DocumentMetadata,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
    encryptedKey?: { issuer: string; kid: string; sharedKey: string },
  ): Promise<Document> => {
    try {
      const encryptedDocumentKey =
        encryptedKey ??
        (await documentRepository.loadKey(user, metadata.documentId!));
      const decryptedDocumentKey = await cryptoService.decryptKey(
        encryptedDocumentKey.sharedKey,
        publicKey,
        privateKey,
      );
      return await decryptDocumentContent(user, metadata, decryptedDocumentKey);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
};

export async function decryptDocumentMetadata(
  metadata: EncryptedDocumentMetadata,
  decryptedDocumentKey: JsonWebKey,
): Promise<DocumentMetadata> {
  console.log(
    "DECRYPTING METADATA LENGTH:",
    metadata.metadata.length,
    "STRING:",
    metadata.metadata,
  );
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
  };
}
async function decryptDocumentContent(
  owner: string,
  metadata: DocumentMetadata,
  decryptedDocumentKey: JsonWebKey,
): Promise<Document> {
  const encryptedContent: ArrayBuffer = await documentRepository.loadContent(
    owner,
    metadata.documentId!,
    metadata.previewImageId ?? metadata.documentId!,
  );

  const decryptedContent = await cryptoService.decryptDocument(
    decryptedDocumentKey,
    encryptedContent,
  );
  return {
    content: decryptedContent,
    documentId: metadata.documentId!,
    name: metadata.name!,
    type: metadata.type,
  };
}
