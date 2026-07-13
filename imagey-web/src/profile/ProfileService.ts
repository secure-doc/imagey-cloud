import { cryptoService } from "../authentication/CryptoService";
import { Profile } from "./Profile";
import { documentService } from "../document/DocumentService";
import EncryptedDocumentMetadata from "../document/EncryptedDocumentMetadata";

export const profileService = {
  saveProfile: async (
    email: string,
    profile: Profile,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<void> => {
    // 1. Create a JSON blob for the profile
    const profileJson = JSON.stringify(profile);
    const profileBlob = new Blob([profileJson], { type: "application/json" });

    // 2. Encrypt the profile data
    const documentKey = await cryptoService.generateSymmetricKey();
    const encryptedDocumentKey = await cryptoService.encryptKey(
      documentKey,
      publicKey,
      privateKey,
    );

    const payloadBuffer = new TextEncoder().encode(profileJson).buffer;
    const encryptedPayload = await cryptoService.encryptDocument(documentKey, [
      payloadBuffer,
    ]);

    // Encrypt the content
    const buffers: ArrayBuffer[] = [await profileBlob.arrayBuffer()];
    const encryptedDocuments = await cryptoService.encryptDocument(
      documentKey,
      buffers,
    );

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([encryptedPayload[0]], { type: "application/octet-stream" }),
    );
    formData.append(
      "key",
      new Blob([cryptoService.base64ToArrayBuffer(encryptedDocumentKey)], {
        type: "application/octet-stream",
      }),
      "key",
    );
    formData.append("issuer", email);
    formData.append(
      "content",
      new Blob([encryptedDocuments[0]], { type: "application/octet-stream" }),
    );

    const response = await fetch(`/users/${email}/profile`, {
      method: "PUT",
      credentials: "same-origin",
      body: formData,
    });

    if (response.status >= 400) {
      throw new Error("Http Error " + response.status);
    }
  },

  loadProfile: async (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Profile | null> => {
    try {
      const response = await fetch(`/users/${user}/profile`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      });

      if (response.status === 404) {
        return null;
      }
      if (response.status >= 400) {
        throw new Error("Http Error " + response.status);
      }

      const metadata: EncryptedDocumentMetadata = await response.json();
      const docMetadata = await documentService.loadDocument(
        user,
        metadata,
        publicKey,
        privateKey,
      );

      const doc = await documentService.loadDocumentContent(
        user,
        docMetadata,
        publicKey,
        privateKey,
        metadata.sharedKey,
      );

      const contentText = new TextDecoder().decode(doc.content);
      const profile: Profile = JSON.parse(contentText);
      return profile;
    } catch (e) {
      console.error("Failed to load profile", e);
      return null;
    }
  },
};
