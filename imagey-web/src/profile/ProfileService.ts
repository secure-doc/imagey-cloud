import { cryptoService } from "../authentication/CryptoService";
import { Profile } from "./Profile";
import { documentService } from "../document/DocumentService";
import { documentRepository } from "../document/DocumentRepository";
import { Settings } from "../contexts/AuthenticationContext";

export const profileService = {
  saveProfile: async (
    email: string,
    profile: Profile,
    picture: File | Blob | undefined,
    settings: Settings,
  ): Promise<void> => {
    const profileJson = JSON.stringify(profile);

    const documentKey = await cryptoService.generateSymmetricKey();

    const payloadBuffer = new TextEncoder().encode(profileJson).buffer;
    const encryptedPayload = await cryptoService.encryptDocument(documentKey, [
      payloadBuffer,
    ]);

    const buffers: ArrayBuffer[] = [];
    if (picture) {
      buffers.push(await picture.arrayBuffer());
    }

    const encryptedDocuments =
      buffers.length > 0
        ? await cryptoService.encryptDocument(documentKey, buffers)
        : [];

    const encryptedDocumentKeyString = await cryptoService.encryptMessage(
      JSON.stringify(documentKey),
      settings.settingsKey,
    );

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([encryptedPayload[0]], { type: "application/octet-stream" }),
    );
    formData.append(
      "key",
      new Blob(
        [cryptoService.base64ToArrayBuffer(encryptedDocumentKeyString)],
        {
          type: "application/octet-stream",
        },
      ),
      "key",
    );
    formData.append("issuer", email);

    if (encryptedDocuments.length > 0) {
      formData.append(
        "content",
        new Blob([encryptedDocuments[0]], { type: "application/octet-stream" }),
      );
    }

    const response = await fetch(
      `/users/${email}/documents/${settings.profile}`,
      {
        method: "PUT",
        credentials: "same-origin",
        body: formData,
      },
    );

    if (response.status >= 400) {
      throw new Error("Http Error " + response.status);
    }
  },

  loadProfile: async (
    user: string,
    settings: Settings,
  ): Promise<{ profile: Profile; picture?: Blob } | null> => {
    try {
      const folderMetadata = (
        await documentRepository.loadDocument(user, settings.profile)
      ).metadata;

      const encryptedFolderKey = await documentRepository.loadKey(
        user,
        settings.profile,
      );

      const folderKeyJson = await cryptoService.decryptMessage(
        encryptedFolderKey.sharedKey,
        settings.settingsKey,
      );
      const folderKey = JSON.parse(folderKeyJson) as JsonWebKey;

      const decryptedPayloadBuffer = await cryptoService.decryptDocument(
        folderKey,
        folderMetadata,
      );
      const payloadText = new TextDecoder().decode(decryptedPayloadBuffer);
      const profile: Profile = JSON.parse(payloadText);

      const doc = await documentService.loadDocumentContent(user, {
        documentId: settings.profile,
        name: "Profile",
        type: "Profile",
        size: 0,
        key: folderKey,
      });

      let picture: Blob | undefined = undefined;
      if (doc.content) {
        picture = new Blob([doc.content]);
      }
      return { profile, picture };
    } catch (e) {
      console.error("Failed to load profile", e);
      return null;
    }
  },
};
