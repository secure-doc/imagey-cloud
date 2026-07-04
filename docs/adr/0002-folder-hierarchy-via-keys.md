# 2. Folder Hierarchy via Shared Keys

Date: 2026-07-04

## Status

Accepted

## Context

We need to support organizing documents into folders within Imagey. Since the application emphasizes end-to-end encryption, the server should have minimal knowledge about the actual document contents and metadata.

## Decision

1. **Folders as Documents:** A folder is treated as a special type of document. The encrypted document payload will contain a `type` attribute that differentiates between `Folder`, `Image`, and `Document`. 
2. **Hierarchy via Key Issuer:** When a document is placed inside a folder, its shared-key is encrypted with the folder's shared-key. To indicate this on the server without leaking structural metadata directly in plain text fields, the JSON representation of the `EncryptedSharedKey` receives a new attribute: `issuerType`.
3. **Issuer Type Field:** The `issuerType` attribute indicates whether the key was issued by a `USER`, `DEVICE`, or a `FOLDER`. This enables the client to determine which folder a document belongs to by inspecting the `issuerType` and the issuer ID (which would be the folder's document ID).
4. **Client-Side Uniqueness:** Uniqueness of folder names within a given level is enforced exclusively by the client. The server does not actively validate folder names, keeping the backend agnostic of business rules related to plaintext names.

## Consequences

*   **Backend Agnosticism:** The backend remains largely agnostic to the folder structure, simply storing relationships in the form of `EncryptedSharedKey` structures.
*   **Performance / Client Load:** The client assumes responsibility for parsing the folder hierarchy by decrypting keys and checking `issuerType`. It also handles duplication checks.
*   **Security:** Folder structures and names remain fully encrypted and unreadable by the server.
