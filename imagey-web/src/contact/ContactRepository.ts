import { UserId } from "../authentication/UserId";
import { IssuerId } from "../chat/Message";
import {
  Email,
  EncryptedSharedKey,
  Kid,
} from "../contexts/AuthenticationContext";
import { Contact, ContactKeys, SharedKey } from "./Contact";
import { ContactRequest } from "./ContactRequest";

export const contactRepository = {
  sendContactRequest: async (
    senderId: UserId,
    addresseeEmail: Email,
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
    contactKeys: ContactKeys,
  ): Promise<void> => {
    const response = await fetch(`/users/${userId}/contacts/${contactId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(contactKeys),
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
  getContacts: async (userId: UserId): Promise<Contact[]> => {
    const response = await fetch(`/users/${userId}/contacts`, {
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
  getSharedContactKey: async (
    userId: UserId,
    contactId: UserId,
  ): Promise<{ issuer: IssuerId; kid: Kid; sharedKey: EncryptedSharedKey }> => {
    const response = await fetch(`/users/${userId}/contacts/${contactId}/key`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error("Failed to get shared contact key");
    }
    return response.json();
  },
  reissueContactKey: async (
    userId: UserId,
    contactId: UserId,
    contactKeys: {
      userKey: SharedKey;
      contactKey: SharedKey;
    },
  ) => {
    const response = await fetch(`/users/${userId}/contacts/${contactId}/key`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(contactKeys),
    });
    if (!response.ok) {
      throw new Error("Failed to reissue contact key");
    }
  },
};
