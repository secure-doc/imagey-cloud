# Domain Model and Glossary

## Core Entities
- **User**: Represents a registered user of the system, identified by a unique `UserId` (currently an email address, but may become a UUID in the future).
- **UserId**: The unique identifier for a `User`.
- **Device**: A client endpoint (e.g., mobile phone or tablet) associated with a `User`. It is identified by a `DeviceId` and has its own cryptographic key pair (public key, encrypted private key) and recovery key for authentication.
- **DeviceId**: The unique identifier for a `Device`.
- **Document**: The central entity representing any file, folder, or image stored in the system. All documents are end-to-end encrypted.
- **Folder**: A special type of `Document` that has no separate content. Instead, its encrypted metadata payload contains a JSON array of child `documentId`s.
- **Root Folder**: A specific `Folder` that acts as the root of the user's file hierarchy. Its ID is referenced in the `Settings Document`.
- **Chat Folder**: A specific `Folder` containing all `Chat`s of a user. Its ID is referenced in the `Settings Document`.
- **Chat**: A `Document` representing a direct communication channel between users, containing messages.
- **Profile**: A specific `Document` containing the user's profile information (like avatar or display name). Its ID is referenced in the `Settings Document`.
- **Contact Request**: A request sent by one user to another to establish a connection. It contains the sender's public key.
- **Contact**: An established connection between two users. It is technically represented by a shared `Chat` document.
- **DocumentMetadata**: An encrypted payload containing metadata associated with a Document (such as name, size, type, and thumbnails), accompanied by its unencrypted `documentId` and `SharedKey`.
- **Settings Document**: A specific document whose ID is the `UserId`. It contains exactly three document IDs: the ID of the `Root Folder`, the ID of the `Chat Folder`, and the ID of the `Profile`.
- **SharedKey**: An encrypted symmetric key (`AES-GCM`) used to decrypt a specific Document.

## Cryptography
- **Document Key**: A unique symmetric `AES-GCM` key generated for every Document. Used to encrypt the document's content and metadata payload.
- **Main Key Pair**: The user's asymmetric key pair (`ECDH`). The private key is encrypted with a password-derived key (`PBKDF2`).
- **Encrypted Shared Key**: The Document Key, encrypted either with the User's Public Key (if in the root) or with a Folder's Document Key (if in a folder).

## Relationships
- **Folder Membership**: A document belongs to a folder if its Document Key is encrypted using the folder's Document Key (creating a SharedKey issued by the `FOLDER`), AND its `documentId` is listed in the folder's encrypted JSON array content.
- **Root Membership**: A document is in the root directory if its Document Key is encrypted with the user's public key (issuer is the `USER`).
