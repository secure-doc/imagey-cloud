import { EncryptedKey } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { Email, Settings } from "../contexts/AuthenticationContext";
import { documentService } from "../document/DocumentService";
import { Contact } from "./Contact";
import { ContactExchange } from "./ContactExchange";

export const contactRepository = {
  sendContactRequest: async (
    senderId: UserId,
    addresseeEmail: Email,
    publicMainKey: JsonWebKey,
  ): Promise<void> => {
    const response = await fetch(`/users/${senderId}/contact-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        recipient: addresseeEmail,
        key: publicMainKey,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to send contact request");
    }
  },
  getContactRequests: async (userId: UserId): Promise<ContactExchange[]> => {
    const response = await fetch(`/users/${userId}/contact-requests`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error("Failed to get contact requests");
    }
    return await response.json();
  },
  acceptContactRequest: async (
    userId: UserId,
    contactId: UserId,
    documentId: string,
    encryptedSymmetricKey: EncryptedKey,
  ): Promise<void> => {
    const response = await fetch(`/users/${userId}/contacts/${contactId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        documentId: documentId,
        key: encryptedSymmetricKey,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to accept contact request");
    }
  },
  declineContactRequest: async (
    userId: UserId,
    contactId: UserId,
  ): Promise<void> => {
    const response = await fetch(
      `/users/${userId}/contact-requests/${contactId}`,
      {
        method: "DELETE",
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      throw new Error("Failed to decline contact request");
    }
  },
  getContacts: async (
    userId: UserId,
    settings: Settings,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Contact[]> => {
    const chatFolder = await documentService.getFolder(
      userId,
      settings.chatFolderId,
      settings.settingsKey,
    );
    const documents = await documentService.loadDocuments(
      userId,
      publicKey,
      privateKey,
      settings.chatFolderId,
      chatFolder.key,
    );
    const chatDocuments = documents.filter((d) => d.type === "Chat");
    return chatDocuments.map((d) => ({
      userId: d.name,
      documentId: d.documentId,
      key: d.key!,
    }));
  },
};
