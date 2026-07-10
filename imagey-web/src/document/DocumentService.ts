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
      return await decryptDocumentContent(user, metadata, decryptedDocumentKey);
    } catch (e) {
      console.error(e);
    }
    return {
      documentId: metadata.documentId,
      name: metadata.name ?? "Encrypted Document",
    };
  },
  loadSharedDocument: async (
    owner: string,
    metadata: DocumentMetadata,
    chatKey: JsonWebKey,
    recipient: string,
  ): Promise<Document> => {
    try {
      const encryptedDocumentKey =
        metadata.sharedKey ??
        (await documentRepository.loadKey(
          owner,
          metadata.documentId,
          recipient,
        ));

      const docKeyStr = await cryptoService.decryptMessage(
        encryptedDocumentKey.sharedKey,
        chatKey,
      );
      const decryptedDocumentKey = JSON.parse(docKeyStr) as JsonWebKey;

      return await decryptDocumentContent(
        owner,
        metadata,
        decryptedDocumentKey,
      );
    } catch (e) {
      console.error(e);
    }
    return {
      documentId: metadata.documentId,
      name: metadata.name ?? "Encrypted Document",
    };
  },
  loadDocuments: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Document[]> => {
    console.log("load documents");
    const metadata = await documentRepository.loadDocuments(user);
    metadata.forEach(async (m) => {
      console.log("encrypt metadata");
      const decryptedDocumentKey = await cryptoService.decryptKey(
        m.sharedKey?.sharedKey || "",
        publicKey,
        privateKey,
      );
      const encryptedDocument = await cryptoService.encryptDocument(
        decryptedDocumentKey,
        [
          new TextEncoder().encode(
            JSON.stringify({
              name: m.name,
              type: m.type,
              size: m.size,
              smallImageId: m.smallImageId,
              previewImageId: m.previewImageId,
            }),
          ).buffer as ArrayBuffer,
        ],
      );
      await documentRepository.storeEncryptedMetadata(
        user,
        m.documentId,
        encryptedDocument[0],
      );
    });
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
};

async function decryptDocumentContent(
  owner: string,
  metadata: DocumentMetadata,
  decryptedDocumentKey: JsonWebKey,
): Promise<Document> {
  let name = metadata.name;
  let previewImageId = metadata.previewImageId;
  let type = metadata.type;

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
  }

  const encryptedContent: ArrayBuffer = await documentRepository.loadContent(
    owner,
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
  };
}
