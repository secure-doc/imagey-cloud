# 22. Folder Sharing

Date: 2026-10-15

## Status

Accepted - read-only sharing and contributions implemented
(docs/plans/share-folders.md, phases 0 to 2 and reading across servers).

## Context

A user could share single documents in a chat (ADR 0015) but no folders. The
building blocks exist: a folder's key can be wrapped for a contact like any
document's key, `verifyAccess` and the Access-Path (ADR 0009) already prove
access to everything below a folder one holds a key for, and ADR 0004 decision
3 lets members add documents to folders. What was missing is the user flow, a
list of what others shared, and a write right that is separate from the read
right (see the amendment to ADR 0004).

## Decision

1. **Sharing goes through the 1:1 chat**, like images. The owner files a direct
   grant on the folder (`{issuer = kid = contact}`, the folder key wrapped with
   the chat key) and posts a `shared-folder` message
   `{documentId, owner, name, contributions, origin?}`. `origin` is set only if
   the folder is not on the chat's server (as for `shared-document`). The root
   folder cannot be shared.
2. **"Shared with me"** is the `sharedFolders` list of the receiver's "chats"
   document (`SharedFolderEntry`: id, owner, name, cached `folderKey`,
   `contributions` as told, and the folder's origin / own id there). It is
   filled only by opening a `shared-folder` message; there is no sweep over all
   chats. Every writer of the "chats" document carries the list along; a writer
   that does not know it reads it first (`knownSharedFolders`), so it is never
   dropped.
3. **Opening a shared folder** needs no key request: the entry holds the key,
   the folder is read as the owner's document with the key, and sub-folders are
   opened with the key unwrapped from their `FolderEntry`. A document below the
   shared folder is reached through the Access-Path built from the folders
   opened so far. After a reload only the shared folder itself can be resolved
   (through the "chats" document); a sub-folder is opened from the shared
   folder again.
4. **Contributions** are the owner's explicit decision per folder **and
   recipient**: a plaintext marker next to the folder, named like the
   recipient's key file (ADR 0004 amendment). The server checks it at the end
   of the caller's Access-Path, so the right holds for the whole sub-tree below
   the shared folder - later created and nested folders included - without
   marking any of them. Sharing a folder again without contributions takes a
   right given before away. A contact on another server cannot be given
   contributions.
5. **The owner records the share** in the folder's encrypted content
   (`sharedWith`), so his other devices know of it. There is no way to withdraw
   a share yet (key slots are write-once).
6. **A folder shared again says what the share is now**: of several messages
   about a folder the newest wins, also when an older one is opened. A refused
   contribution (403) is reported, the folder stops offering to add, and the
   entry of "Shared with me" is set read-only, so a withdrawn right shows in the
   next session too.
7. **A contribution lives in the contributor's tree** (`FolderEntry.owner`, ADR
   0004 decision 3) and is read through a two-hop Access-Path.

## Consequences

- The marker is named like the recipient's key file: it reveals no edge the key
  file does not reveal (ADR 0009).
- "Contributions allowed" means "edit together": a contributor rewrites the
  whole folder content, and the server cannot see whether only an entry was
  added.
- Reading a folder of a contact on another server works with the guest session
  of ADR 0013; contributions from there are a later step (F10c).
