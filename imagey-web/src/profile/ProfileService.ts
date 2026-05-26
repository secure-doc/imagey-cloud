import { cryptoService } from "../authentication/CryptoService";
import DocumentMetadata from "../document/DocumentMetadata";
import { Profile } from "./Profile";
import { documentService } from "../document/DocumentService";

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

    // Metadata for the profile document
    const metadata: DocumentMetadata = {
      name: "profile.json",
      type: "application/json",
      size: profileBlob.size,
      documentId: "profile",
      encryptedData: cryptoService.arrayBufferToBase64(encryptedPayload[0]),
    };

    // Encrypt the content
    const buffers: ArrayBuffer[] = [await profileBlob.arrayBuffer()];
    const encryptedDocuments = await cryptoService.encryptDocument(
      documentKey,
      buffers,
    );

    // 3. Upload using the new PUT endpoint
    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    formData.append("sharedKey", encryptedDocumentKey);
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

      const metadata: DocumentMetadata = await response.json();
      const doc = await documentService.loadDocument(
        user,
        metadata,
        publicKey,
        privateKey,
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
