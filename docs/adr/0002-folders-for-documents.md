# 2. Folders for Documents

Date: 2026-07-02

## Status

Proposed (Under Discussion)

## Context

We are introducing the concept of "Folders" to allow users to organize their Documents. During the design phase, a key question arose: should a Document belong to exactly one Folder (1:N), or multiple Folders (M:N)?

Currently, our backend persists Documents on the file system (`rootPath/userEmail/documents/documentId/`). 

### Option A: 1:N Relationship (Strict Hierarchy)
- **Concept:** A document physically or conceptually lives in exactly one folder.
- **Impact:** We could move the document directories inside folder directories, or store a single `folderId` in `DocumentMetadata`. Moving a document means changing its parent.

### Option B: M:N Relationship (Folders as Tags/Labels)
- **Concept:** A document can exist in multiple folders simultaneously.
- **Impact:** Folders act more like "Labels" or "Playlists". 
- **Storage:** We would keep the physical document storage where it is (`documents/documentId/`) and maintain Folders as separate entities that contain lists of `DocumentId`s (or add a list of `folderIds` to `DocumentMetadata`).
- **UI:** The frontend would need a way to "Link" documents to folders (e.g., via checkboxes) rather than just moving them. Editing a document in Folder A would reflect the changes in Folder B.

## Decision

We will proceed with **Option B: M:N Relationship (Folders as Tags/Labels)**, implemented uniquely by treating **Folders as a Document Type**. 

Since the backend treats all Documents as opaque encrypted blobs, a "Folder" will simply be a Document whose `encryptedData` specifies `type: "folder"`. The frontend will manage the relationships entirely.

## Consequences

- **Backend / Storage**: A Folder is just a Document. It reuses the exact same storage and sharing (`encrypted-shared-keys`) mechanisms as an image. However, to optimize the bidirectional update, a new batch endpoint (`PATCH /{email}/documents`) will be added to update multiple `DocumentMetadata` in a single request. It will use the standard `application/json-patch+json` media type (RFC 6902) to apply partial modifications, **restricted to only 'add' and 'replace' operations**.
- **Bidirectional Links**: The frontend will store child `documentIds` inside the Folder's `encryptedData`, and parent `folderIds` inside the Image Document's `encryptedData`. Adding a document to a folder simply requires one batch `PATCH /{email}/documents` request with `application/json-patch+json` (using `add` or `replace`) to update both `encryptedData` payloads atomically.
- **Hierarchy**: Because a Folder is a Document, and a Document can be in a Folder, Folders can naturally be nested inside other Folders.
- **Future Editability**: When Documents become editable in the future, the UI must prompt the user to clarify their intention: whether to edit the Document globally (across all Folders) or create a new instance (duplicate) for the current Folder.
- **Deletion**: Deleting a Folder does not delete the Documents within it.
