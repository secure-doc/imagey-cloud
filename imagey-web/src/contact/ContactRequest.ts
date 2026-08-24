import { UserId } from "../authentication/UserId";

// INVITED: the inviter sent a request, awaiting the invitee's decision.
// ACCEPTED: the invitee accepted, generated the chat Document + its key,
//   and encrypted that key for the inviter (chatId/sharedKey/publicKey
//   below are populated). The inviter still needs to pick this up.
// RECEIVED: the inviter decrypted the shared key and recorded the contact
//   locally - purely transient, the server deletes the request once both
//   sides have reached this point (see ContactService.receiveContactRequest).
// DENIED: the invitee declined.
export type ContactRequestStatus =
  | "INVITED"
  | "ACCEPTED"
  | "DENIED"
  | "RECEIVED";

export type ContactRequest = {
  inviter: UserId;
  invitee: UserId;
  // While INVITED: the inviter's public main key (so the invitee can wrap
  // the chat key for them on accept).
  // Once ACCEPTED: overwritten by the invitee with the invitee's OWN
  // public main key instead (so the inviter can derive the same ECDH
  // shared secret the invitee used to wrap `sharedKey`).
  publicKey: JsonWebKey;
  status: ContactRequestStatus;
  // Only present once status is ACCEPTED: the chat Document's id and its
  // Document key, ECDH-encrypted (with the invitee's private key and the
  // inviter's public key) and base64-encoded.
  chatId?: string;
  sharedKey?: string;
};
