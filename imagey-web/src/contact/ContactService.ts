import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { JsonWebKeyPair, Settings } from "../contexts/AuthenticationContext";
import { contactRepository } from "./ContactRepository";
import { documentService } from "../document/DocumentService";

export const contactService = {
  acceptContactRequest: async (
    userId: UserId,
    contactId: UserId,
    settings: Settings,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<{ documentId: string; key: JsonWebKey }> => {
    try {
      const contactRequests =
        await contactRepository.getContactRequests(userId);
      const contactRequest = contactRequests.find(
        (req) => req.inviter === contactId,
      );
      if (!contactRequest || !contactRequest.publicKey) {
        throw new Error("Contact request not found or public key missing");
      }
      const contactPublicKey = contactRequest.publicKey;
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

      const chatFolder = await documentService.getFolder(
        userId,
        settings.chatFolderId,
        settings.settingsKey,
      );
      const chatFolderKey = chatFolder.key;

      const myEncryptedSharedKeyString = await cryptoService.encryptMessage(
        JSON.stringify(chatDocumentKey),
        chatFolderKey!,
      );

      await fetch(`/users/${userId}/documents/${documentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: encryptedChatFolderPayload[0],
      });

      // Upload my key (under chat folder)
      await fetch(
        `/users/${userId}/documents/${documentId}/keys/${settings.chatFolderId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sharedKey: myEncryptedSharedKeyString }),
        },
      );

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
        contactEncryptedSharedKey,
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
    settings: Settings,
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

    const chatFolder = await documentService.getFolder(
      userEmail,
      settings.chatFolderId,
      settings.settingsKey,
    );
    const myEncryptedSharedKeyString = await cryptoService.encryptMessage(
      JSON.stringify(sharedKey),
      chatFolder.key!,
    );

    const responseUser = await fetch(
      `/users/${userEmail}/documents/${chatDocumentId}/keys/${settings.chatFolderId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerType: "FOLDER",
          issuer: settings.chatFolderId,
          kid: "0",
          sharedKey: myEncryptedSharedKeyString,
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

  processAcceptedInvitations: async (
    userId: UserId,
    settings: Settings,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<void> => {
    const exchanges = await contactRepository.getContactRequests(userId);
    const accepted = exchanges.filter(
      (e) =>
        e.inviter === userId && e.sharedKey !== null && e.documentId !== null,
    );

    if (accepted.length === 0) {
      return;
    }

    const contacts = await contactRepository.getContacts(
      userId,
      settings,
      mainKeyPair.publicKey,
      mainKeyPair.privateKey,
    );
    const existingContactIds = new Set(contacts.map((c) => c.userId));

    if (accepted.length > 0) {
      const chatFolder = await documentService.getFolder(
        userId,
        settings.chatFolderId,
        settings.settingsKey,
      );
      const chatFolderKey = chatFolder.key;

      for (const exchange of accepted) {
        const contactId = exchange.invitee;
        if (!existingContactIds.has(contactId)) {
          try {
            const contactPublicKey =
              await authenticationRepository.loadPublicMainKey(contactId);

            const chatDocumentKey = await cryptoService.decryptKey(
              exchange.sharedKey!,
              contactPublicKey,
              mainKeyPair.privateKey,
            );

            const documentId = exchange.documentId!;

            const chatFolderPayload = JSON.stringify({
              name: contactId,
              type: "Chat",
            });
            const chatFolderPayloadBuffer = new TextEncoder().encode(
              chatFolderPayload,
            ).buffer;
            const encryptedChatFolderPayload =
              await cryptoService.encryptDocument(chatDocumentKey, [
                chatFolderPayloadBuffer,
              ]);

            const myEncryptedSharedKeyString =
              await cryptoService.encryptMessage(
                JSON.stringify(chatDocumentKey),
                chatFolderKey!,
              );

            await fetch(`/users/${userId}/documents/${documentId}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/octet-stream",
              },
              body: encryptedChatFolderPayload[0],
            });

            await fetch(
              `/users/${userId}/documents/${documentId}/keys/${settings.chatFolderId}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ sharedKey: myEncryptedSharedKeyString }),
              },
            );
          } catch (e) {
            console.error(
              "Failed to process accepted invitation for",
              contactId,
              e,
            );
          }
        }
      }
    }
  },
};
