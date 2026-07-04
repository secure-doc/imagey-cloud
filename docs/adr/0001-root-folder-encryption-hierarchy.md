# Architecture Decision Record: Root-Folder Encryption Hierarchy

## Context
Our application needs a structured way to manage document uploads and secure their symmetric encryption keys. Previously, documents might not have enforced a strict folder hierarchy for encryption. To enhance security, organization, and hierarchical access, we need to introduce a default Root-Folder.

## Decision
We will introduce a "Root-Folder" for all users:
1. **Root-Folder Storage**: The ID of the Root-Folder will be stored in the user's `Settings` under the `documents` attribute.
2. **Root-Folder Key**: The Root-Folder gets its own symmetric key. This key is encrypted with the user's Settings symmetric key.
3. **Document Keys**: Every uploaded document (except the Settings document) will have its own symmetric key. This document key will be encrypted using the symmetric key of the folder it resides in (which may be the Root-Folder).
4. **Lazy Creation**: The Root-Folder will be created lazily. When a user navigates to the default view (e.g., "Images"), the application will check if the Root-Folder exists and create it if necessary, subsequently updating the Settings document.

## Consequences
- **Positive**: Establishes a solid foundation for hierarchical document sharing and encryption. All documents are securely tied to a folder's lifecycle.
- **Negative**: Adds a slight overhead on the first load/upload if the Root-Folder needs to be created. Requires migration of existing test data.

## Status
Accepted
