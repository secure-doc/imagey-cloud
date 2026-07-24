import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";
import { contactRepository } from "./ContactRepository";

export const contactService = {
  acceptContactRequest: async (
    userId: UserId,
    contactId: UserId,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<{ documentId: string; key: JsonWebKey }> => {
    try {
      const contactPublicKey =
        await authenticationRepository.loadPublicMainKey(contactId);

      const chatDocumentKey = await cryptoService.generateSymmetricKey();
      const documentId = cryptoService.generateUuid();

      const chatFolderPayload = JSON.stringify({
        name: contactId,
        type: "Chat",
      });
      const chatFolderPayloadBuffer = new TextEncoder().encode(
        chatFolderPayload,
      ).buffer;
      const encryptedChatFolderPayload = await cryptoService.encryptDocument(
        chatDocumentKey,
        [chatFolderPayloadBuffer],
      );

      const contactEncryptedSharedKey = await cryptoService.encryptKey(
        chatDocumentKey,
        contactPublicKey,
        mainKeyPair.privateKey,
      );
      const myEncryptedSharedKey = await cryptoService.encryptKey(
        chatDocumentKey,
        mainKeyPair.publicKey,
        mainKeyPair.privateKey,
      );

      await fetch(`/users/${userId}/documents/${documentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: encryptedChatFolderPayload[0],
      });

      // Upload my key
      await fetch(`/users/${userId}/documents/${documentId}/keys/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sharedKey: myEncryptedSharedKey }),
      });

      // Upload contact key
      await fetch(
        `/users/${userId}/documents/${documentId}/keys/${contactId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sharedKey: contactEncryptedSharedKey }),
        },
      );

      await contactRepository.acceptContactRequest(
        userId,
        contactId,
        documentId,
      );

      return { documentId, key: chatDocumentKey };
    } catch (e) {
      console.error(
        "Error in acceptContactRequest",
        typeof e,
        e,
        e instanceof Error ? e.stack : "",
      );
      throw e;
    }
  },

  reissueKey: async (
    userEmail: string,
    contactEmail: string,
    chatDocumentId: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const contactPublicKey =
      await authenticationRepository.loadPublicMainKey(contactEmail);
    const sharedKey = await cryptoService.generateSymmetricKey();
    const contactEncryptedSharedKey = await cryptoService.encryptKey(
      sharedKey,
      contactPublicKey,
      privateKey,
    );
    const myEncryptedSharedKey = await cryptoService.encryptKey(
      sharedKey,
      publicKey,
      privateKey,
    );
    const responseUser = await fetch(
      `/users/${userEmail}/documents/${chatDocumentId}/keys/${userEmail}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerType: "USER",
          issuer: userEmail,
          kid: "0",
          sharedKey: myEncryptedSharedKey,
        }),
      },
    );
    if (!responseUser.ok) {
      throw new Error("Failed to reissue key");
    }

    const responseContact = await fetch(
      `/users/${userEmail}/documents/${chatDocumentId}/keys/${contactEmail}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerType: "USER",
          issuer: contactEmail,
          kid: "0",
          sharedKey: contactEncryptedSharedKey,
        }),
      },
    );
    if (!responseContact.ok) {
      throw new Error("Failed to reissue key");
    }
    return sharedKey;
  },
};
