import { UserId } from "../authentication/UserId";

// The three-leg handshake of ADR 0015 - the inviter owns the chat, and both
// parties derive its key via ECDH + HKDF (cryptoService.deriveChatKey):
// INVITED: the inviter sent a request (with the chat's id), awaiting the
//   invitee's decision.
// ACCEPTED: the invitee accepted, derived the chat key and handed over their
//   own entry for it (sharedKey/publicKey below). From now on the invitee can
//   already write messages. The inviter still needs to pick this up.
// RECEIVED: the inviter created the chat Document and the server filed the
//   invitee's key entry under it (see ContactService.receiveContactRequest).
// DENIED: the invitee declined.
export type ContactRequestStatus =
  | "INVITED"
  | "ACCEPTED"
  | "DENIED"
  | "RECEIVED";

export type ContactRequest = {
  inviter: UserId;
  invitee: UserId;
  // While INVITED: the inviter's public main key (so the invitee can derive
  // the chat key on accept).
  // Once ACCEPTED: overwritten by the invitee with the invitee's OWN
  // public main key instead (so the inviter can derive the same chat key).
  publicKey: JsonWebKey;
  status: ContactRequestStatus;
  // The id of the chat Document, chosen by the inviter at invite time. The
  // chat Document itself is only created by the inviter in leg 3.
  chatId: string;
  // Only present once status is ACCEPTED: the chat key wrapped by the invitee
  // under their own "chats" document key - opaque to the inviter, the server
  // files it verbatim under the chat Document on RECEIVED.
  sharedKey?: string;
  // The sender's "public-profile" Document id (see
  // docs/plans/chat-public-profile.md §4): the inviter's while INVITED,
  // overwritten by the invitee's own once ACCEPTED - mirrors how `publicKey`
  // is overwritten on accept. Optional: a sender's public-profile may not
  // exist yet (should not normally happen, see §3.6).
  publicProfileId?: string;
  // The sender's display name and address (ContactInfo), encrypted - same
  // "sender of the latest transition" semantics as `publicKey`: while
  // INVITED the inviter's, under cryptoService.deriveInvitationKey(invitee's
  // address, chatId); once ACCEPTED the invitee's, under the chat key. Opaque
  // to the server. Optional: an older request may not carry it.
  contactInfo?: string;
};

// What the other party tells about themselves on a contact request, so it
// can show a name/address before any public profile is reachable.
export type ContactInfo = {
  name?: string;
  email?: string;
};
