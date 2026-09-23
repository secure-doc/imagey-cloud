import { UserId } from "../authentication/UserId";
import { Email } from "../contexts/AuthenticationContext";
import { ContactRequest } from "./ContactRequest";

export const contactRepository = {
  sendContactRequest: async (
    inviter: UserId,
    inviterEmail: Email,
    invitee: Email,
    publicKey: JsonWebKey,
    publicProfileId: string,
    chatId: string,
  ): Promise<void> => {
    const response = await fetch(`/users/${inviter}/contact-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      // inviterEmail is only used server-side to name the inviter in the
      // invitation mail sent to a not-yet-registered invitee; it is not stored.
      body: JSON.stringify({
        invitee,
        inviterEmail,
        publicKey,
        publicProfileId,
        chatId,
      }),
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
  // Called by the invitee to accept (see ContactService.acceptContactRequest):
  // hands over their own public main key (so the inviter can derive the chat
  // key) and their own entry for the chat key, wrapped under their "chats"
  // document key. Moves the request to status ACCEPTED.
  acceptContactRequest: async (
    invitee: UserId,
    inviter: UserId,
    publicKey: JsonWebKey,
    sharedKey: string,
    publicProfileId: string,
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
          sharedKey,
          publicProfileId,
        }),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to accept contact request");
    }
  },
  // Called by the inviter once they've created the chat Document: moves the
  // request to status RECEIVED. The server then files the invitee's key entry
  // (from the ACCEPTED update) under the chat Document, which grants the
  // invitee the regular "member" role on the chat (see
  // ContactService.confirmReceipt on the server).
  confirmContactRequestReceived: async (
    inviter: UserId,
    invitee: UserId,
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
