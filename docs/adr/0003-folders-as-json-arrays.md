# 3. Folders as JSON Arrays

Date: 2026-07-04

## Status

Accepted (Replaces ADR 0002)

## Context

Previously (ADR 0002), folder hierarchy was maintained implicitly. A folder was a document, and children were linked to it merely by having their `EncryptedSharedKey` issued to the folder's ID instead of the user's ID. 
This implicit hierarchy made it difficult to maintain deterministic ordering of documents within a folder and complicated the frontend logic for rendering and loading contents. The previous model also required loading all metadata for a folder simply by querying the server with `folderId`, without a single source of truth for the folder's actual explicit contents.

## Decision

1. **Folders as Documents with Payload:** A folder remains a special type of `Document` (identified by `type: "Folder"`). However, its encrypted `content` payload will now explicitly store a JSON array of `documentId` strings representing its children.
2. **Explicit Membership:** To load a folder, the frontend first decrypts the folder's `content` to obtain the JSON array of IDs. It then uses these IDs to fetch the corresponding child documents.
3. **Cryptographic Key Management:** We retain the existing cryptographic key hierarchy. The child document still receives an encrypted shared key issued to the folder's ID, which is used for decryption by the folder's symmetric key. The JSON array serves as the authoritative source for ordering and visibility, while the shared keys maintain cryptographic integrity.
4. **Optimistic Locking:** Because adding a document to a folder now requires modifying the folder's `content` array (a read-modify-write operation), we will introduce optimistic locking (e.g., using ETags or a version number) to prevent lost updates during concurrent uploads. If a conflict occurs, the frontend will retry the read-modify-write cycle.
5. **Migration Strategy:** As there is no production data yet, we will not write migration scripts. Existing testing data will be deleted to start fresh.

## Consequences

*   **Explicit Ordering:** The JSON array allows the client to deterministically order the documents in a folder.
*   **Clear Source of Truth:** The folder document itself explicitly defines what it contains.
*   **Increased Complexity for Uploads:** Uploading a document into a folder now requires updating the folder document in addition to creating the new document, increasing the number of network requests and requiring concurrency control.
*   **Performance Impact:** The client must now download and decrypt the folder document *before* it knows which child documents to fetch. This may introduce an additional round-trip latency when opening a folder.
