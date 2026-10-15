export interface BaseMetadata {
  documentId: string;
  name: string;
  owner: string;
  revision: string;
  key: JsonWebKey;
  // The server the document lives on, if not the own one (ADR 0013, F8); set by the
  // DocumentService of that server when it loads the document.
  origin?: string;
}

export interface ProfileMetadata extends BaseMetadata {
  type: "profile";
  emails: string[];
  profileImageId?: string;
  publicProfileId?: string;
}

export interface PublicProfileMetadata extends BaseMetadata {
  type: "publicProfile";
  avatarId?: string;
}

export interface ChatListMetadata extends BaseMetadata {
  type: "chatList";
  contacts: ContactEntry[];
  // Groups the user owns or has joined (ADR 0019); optional so existing
  // "chats" Documents stay valid without a migration (ADR 0008).
  groups?: GroupEntry[];
  // Folders other users shared with the user, taken over from a "shared-folder"
  // chat message; optional for the same reason as `groups`.
  sharedFolders?: SharedFolderEntry[];
}

// A folder another user shared with the user (docs/plans/share-folders.md
// §2.3), listed under "Shared with me".
export interface SharedFolderEntry {
  documentId: string;
  // The folder's owner, as a UserId on the folder's server.
  owner: string;
  name: string;
  // Cached like GroupEntry.groupKey: opening the folder needs no detour
  // through the chat. Protected by the encryption of the "chats" document.
  folderKey: JsonWebKey;
  // As told by the owner - display only, the server decides on every upload.
  contributions: boolean;
  // Where the folder lives, if not on the own server, and the own UserId
  // there - same conventions as GroupEntry.
  chatOrigin?: string;
  self?: { userId: string; address?: string };
}

export interface ChatMetadata extends BaseMetadata {
  type: "chat";
  // Each party's "public-profile" Document id, keyed by their UserId (see
  // docs/plans/chat-public-profile.md §3.3). Written once, by the chat's
  // creator, at accept time.
  publicProfiles: Record<string, string>;
}

// A group chat's own Document, a child of the owner's "chats" Document
// (ADR 0019). `members` includes the owner (BaseMetadata.owner already
// carries them - no separate `owner` field like the ADR's illustrative
// snippet).
export interface GroupMetadata extends BaseMetadata {
  type: "group";
  members: string[];
  // Each member's "public-profile" Document id, keyed by their UserId - like
  // ChatMetadata.publicProfiles, populated as members share their profile
  // into the group.
  publicProfiles: Record<string, string>;
  // Display names of members whose public profile is not reachable through the group (their
  // home server is not the group's, ADR 0019 amendment, F9). Written by the owner from his
  // ContactEntry.
  memberNames?: Record<string, string>;
}

// A chat-list entry for a group the user owns or has joined, with a
// denormalized name snapshot so the chat list can render without a
// per-group fetch - like ContactEntry.name.
export interface GroupEntry {
  groupId: string;
  owner: string;
  name: string;
  // Only on a non-owner's side, cached once at join time (ContactService.pending
  // is the closest analogue): the group's own Document key, so opening the
  // group needs no detour through the 1:1 chat that carried the invitation.
  groupKey?: JsonWebKey;
  // ADR 0019 amendment (F9), like ContactEntry: the group's server, if it is not the own one
  // (absent = own server). Then `owner` is a UserId ON THAT SERVER.
  chatOrigin?: string;
  // Own UserId on `chatOrigin` (its ForeignUserMapping) and the address that mapping is bound
  // to, if known - needed to renew the guest session there (rememberAddress).
  self?: { userId: string; address?: string };
}

export interface FolderMetadata extends BaseMetadata {
  type: "folder";
  documents: FolderEntry[];
  // Contacts the owner shared this folder with, kept here (encrypted) so the
  // owner's other devices know about it too.
  sharedWith?: { contactUserId: string; contributions: boolean }[];
}

export interface FileMetadata extends BaseMetadata {
  type: "file";
  mimeType: string;
  size: number;
  contentId: string;
}

export interface ImageMetadata extends BaseMetadata {
  type: "image";
  mimeType: string;
  size: number;
  contentId: string;
  // ~480px, written on upload; read by SharedDocumentMessage for the chat preview.
  smallImageId: string;
  // ~1024px, renamed from previewImageId - what the grid actually renders.
  mediumImageId: string;
}

// A folder's child, as embedded directly in the parent's own document so a
// folder listing can render (name/icon/thumbnail) without a per-child
// metadata+key request. `sharedKey` is wrapped under the FOLDER's own key
// (not the child's issuer/kid scheme), so it can be unwrapped locally with
// cryptoService.decryptKey and no network round-trip.
export interface FolderEntry {
  documentId: string;
  name: string;
  type: "folder" | "file" | "image";
  mimeType?: string;
  mediumImageId?: string;
  // The owner of the child, if it is not the owner of the folder: a document
  // contributed by a member lives in the contributor's tree.
  owner?: string;
  sharedKey: { sharedKey: string };
}

// A chat-list contact, with a denormalized snapshot of the counterpart's
// public profile so the chat list can render without a per-contact fetch.
// `profileRevision` is the PublicProfileMetadata.revision the snapshot was
// taken from - compared on chat-open to detect a stale name/avatar.
export interface ContactEntry {
  userId: string;
  chatId: string;
  owner: string;
  name: string;
  // The contact's address, as told on the contact request (see
  // ContactRequest.contactInfo) - a display value only, may be absent.
  email?: string;
  avatarId?: string;
  profileRevision: string;
  // Only on the invitee's side, between accepting and the inviter creating the
  // chat Document (ADR 0015 decision 5): the derived chat key and the chat's
  // public-profile ids, used by ContactService.loadChatKey while the chat
  // Document is not accessible yet. Removed (ContactService.dropPendingChatKey)
  // as soon as the chat view has loaded the chat Document itself.
  pending?: {
    chatKey: JsonWebKey;
    publicProfiles: Record<string, string>;
  };
  // ADR 0013 A11 (F7): where the chat lives, if not on this server (origin, e.g.
  // "https://imagey.cloud"). Absent = own server (all existing entries). Then `userId` and
  // `owner` are UserIds ON THAT SERVER.
  chatOrigin?: string;
  // Own UserId on `chatOrigin` (its ForeignUserMapping) and the address that mapping is bound
  // to - needed to renew the guest session there (rememberAddress).
  self?: { userId: string; address: string };
  // The contact's UserId on THIS server (their ForeignUserMapping here), if it differs from
  // `userId`: the grantee of documents we share into the chat - they stay on our server (F8).
  localUserId?: string;
  // Where the contact's public profile lives, if not on the chat's server: the contact's home
  // server and UserId there (from the encrypted contactInfo).
  profileHome?: { origin: string; userId: string };
}

type DocumentMetadata =
  | ProfileMetadata
  | PublicProfileMetadata
  | ChatListMetadata
  | ChatMetadata
  | GroupMetadata
  | FolderMetadata
  | FileMetadata
  | ImageMetadata;

export default DocumentMetadata;

// storeDocument's return value, before the document has ever been loaded: the
// server's upload response only carries the *parent folder's* new revision,
// so the new child's own `revision` is genuinely unknown yet. The only
// sanctioned "DocumentMetadata missing revision" shape.
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type NewDocumentMetadata = DistributiveOmit<
  DocumentMetadata,
  "revision"
> & { revision?: string };
