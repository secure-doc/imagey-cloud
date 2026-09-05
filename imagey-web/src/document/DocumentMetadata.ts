import { Contact } from "../contact/Contact";

export default interface DocumentMetadata {
  documentId: string;
  name: string;
  // The account whose tree this document lives in (stamped by
  // documentService.loadDocument). Differs from the viewer for a document
  // seen via a chat share; used to build content-fetch URLs.
  owner?: string;
  type?: string;
  size?: number;
  contentId?: string;
  smallImageId?: string;
  previewImageId?: string;
  documents?: string[];
  // Set by documentService.loadDocument when the document could NOT be fetched
  // or decrypted. Such a result is a placeholder for display only - it has no
  // `key`, `documents` or `etag` - and MUST NOT be used as the read-modify-write
  // base for a folder/chats update (that would persist an empty child list and
  // drop every existing entry).
  loadFailed?: boolean;
  // ETag the document was loaded with (documentService.loadDocument). Sent back
  // as a precondition on the next read-modify-write of this document so a
  // concurrent change is detected instead of silently overwritten.
  etag?: string;
  // The wrapped key envelope as returned by GET .../keys/{kid} - just the
  // ciphertext since ADR 0009 (issuer / kid are no longer disclosed).
  sharedKey?: {
    sharedKey: string;
  };
  emails?: string[];
  key?: JsonWebKey;
  // Present on the "chats" document: the user's contacts, each paired
  // with the id of the (also encrypted) chat Document they now share.
  contacts?: Contact[];
  // Present on a "public-profile" document: the id of its avatar file
  // (analogous to profilePictureId on the private Profile), and its
  // display name (see profile/PublicProfile.ts - optional there too).
  avatarId?: string;
  // Present on the private Profile once publicProfileService.ensurePublicProfile
  // has created one for this user: the linked "public-profile" Document's id
  // (see profile/Profile.ts and docs/plans/chat-public-profile.md §3.1).
  publicProfileId?: string;
  // Present on a chat Document: each party's "public-profile" Document id,
  // keyed by their UserId (see docs/plans/chat-public-profile.md §3.3).
  // Written once, by the chat's creator, at accept time.
  publicProfiles?: Record<string, string>;
}
