export interface BaseMetadata {
  documentId: string;
  name: string;
  owner: string;
  revision: string;
  key: JsonWebKey;
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
}

export interface ChatMetadata extends BaseMetadata {
  type: "chat";
  // Each party's "public-profile" Document id, keyed by their UserId (see
  // docs/plans/chat-public-profile.md §3.3). Written once, by the chat's
  // creator, at accept time.
  publicProfiles: Record<string, string>;
}

export interface FolderMetadata extends BaseMetadata {
  type: "folder";
  documents: FolderEntry[];
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
}

type DocumentMetadata =
  | ProfileMetadata
  | PublicProfileMetadata
  | ChatListMetadata
  | ChatMetadata
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
