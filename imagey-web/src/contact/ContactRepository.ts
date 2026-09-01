import { UserId } from "../authentication/UserId";
import { Email } from "../contexts/AuthenticationContext";
import { ContactRequest } from "./ContactRequest";

export const contactRepository = {
  sendContactRequest: async (
    inviter: UserId,
    inviterEmail: Email,
    invitee: Email,
    publicKey: JsonWebKey,
  ): Promise<void> => {
    const response = await fetch(`/users/${inviter}/contact-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      // inviterEmail is only used server-side to name the inviter in the
      // invitation mail sent to a not-yet-registered invitee; it is not stored.
      body: JSON.stringify({ invitee, inviterEmail, publicKey }),
    });
    if (!response.ok) {
      throw new Error("Failed to send contact request");
    }
  },
  // Returns every contact request the user is party to (as inviter or
  // invitee), in every status - the caller is responsible for filtering
  // by status/role for what it wants to show or process.
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
    return response.json();
  },
  // Called by the invitee to accept: generates and uploads the chat
  // Document (see ContactService.acceptContactRequest), then hands the
  // inviter their ECDH-wrapped copy of its key via this PUT. Moves the
  // request to status ACCEPTED.
  acceptContactRequest: async (
    invitee: UserId,
    inviter: UserId,
    publicKey: JsonWebKey,
    chatId: string,
    sharedKey: string,
  ): Promise<void> => {
    const response = await fetch(
      `/users/${invitee}/contact-requests/${inviter}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          inviter,
          invitee,
          status: "ACCEPTED",
          publicKey,
          chatId,
          sharedKey,
        }),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to accept contact request");
    }
  },
  // Called by the inviter once they've decrypted the shared key and
  // recorded the contact locally: moves the request to status RECEIVED,
  // which the server treats as "done" and deletes. `chatKey` is the chat
  // Document key re-wrapped under the inviter's own chats-document key
  // (issuer = the inviter); the server files it under the chat Document in
  // the invitee's tree, which is what later grants the inviter access to
  // the chat (see ContactService.confirmReceipt on the server).
  confirmContactRequestReceived: async (
    inviter: UserId,
    invitee: UserId,
    chatKey: { issuer: string; kid: string; sharedKey: string },
  ): Promise<void> => {
    const response = await fetch(
      `/users/${inviter}/contact-requests/${invitee}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          inviter,
          invitee,
          status: "RECEIVED",
          chatKey,
        }),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to confirm contact request received");
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
};
