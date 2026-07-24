import { UserId } from "../authentication/UserId";
import { documentService } from "../document/DocumentService";
import { Contact } from "./Contact";
import { ContactRequest } from "./ContactRequest";

export const contactRepository = {
  sendContactRequest: async (
    senderId: UserId,
    addresseeEmail: string,
  ): Promise<void> => {
    const response = await fetch(`/users/${senderId}/contact-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ email: addresseeEmail }),
    });
    if (!response.ok) {
      throw new Error("Failed to send contact request");
    }
  },
  getContactRequests: async (userId: UserId): Promise<ContactRequest[]> => {
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
    const userIds: UserId[] = await response.json();
    return userIds.map((userId) => ({ userId }));
  },
  acceptContactRequest: async (
    userId: UserId,
    contactId: UserId,
    documentId: string,
  ): Promise<void> => {
    const response = await fetch(`/users/${userId}/contacts/${contactId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      credentials: "same-origin",
      body: documentId,
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
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<Contact[]> => {
    const documents = await documentService.loadDocuments(
      userId,
      publicKey,
      privateKey,
    );
    const chatDocuments = documents.filter((d) => d.type === "Chat");
    return chatDocuments.map((d) => ({
      userId: d.name,
      documentId: d.documentId,
      key: d.key!,
    }));
  },
};
