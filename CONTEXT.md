# Domain Model and Glossary

## Core Entities
- **User**: Represents a registered user of the system, identified by an email address.
- **Document**: The central entity representing any file, folder, or image stored in the system. All documents are end-to-end encrypted.
- **Folder**: A special type of `Document` whose encrypted content is a JSON array of child `documentId`s.
- **Chats Document**: A special type of `Document` (referenced from a user's Settings, like the root document folder and the profile) whose encrypted content is a `contacts` array of `{ userId, chatId }` pairs and an optional `groups` array of Group Entries - contacts/chats/groups are, like everything else, also just an encrypted Document.
- **Contact**: One entry in a user's Chats Document: the other user's id plus the `chatId` of the (also encrypted) Document representing that chat.
- **Group**: A group chat with any number of members - a `Document` of type `group` owned by its creator, a child of the creator's Chats Document, whose encrypted content holds the group's `name`, `owner`, `members` and each member's public-profile id. Only the creator manages it, and only the creator's contacts can be added (ADR 0019).
- **Group Entry**: One entry in a user's Chats Document's `groups` array: `{ groupId, owner, name, groupKey? }`. Written by the creator when creating the group and by a member when joining; a member's entry carries the Group Key.
- **Group Invitation**: A message `{ type: "group-invitation", groupId, owner, name }` the creator posts into the 1:1 chat with a newly added member; joining from it adds the Group Entry.
- **DocumentMetadata**: Non-encrypted (or partially encrypted) metadata associated with a Document, such as its ID, name, size, type, and references to image thumbnails.
- **SharedKey**: An encrypted symmetric key (`AES-GCM`) used to decrypt a specific Document.

## Cryptography
- **Document Key**: A unique symmetric `AES-GCM` key generated for every Document. Used to encrypt the document's content and metadata payload.
- **Main Key Pair**: The user's asymmetric key pair (`ECDH`). The private key is encrypted with a password-derived key (`PBKDF2`).
- **Group Key**: The random `AES-GCM` Document Key of a Group. Delivered to each member as a key entry `{ issuer = kid = member }` under the Group, wrapped with the 1:1 chat key between creator and member - that entry also grants the member access (ADR 0019).
- **Encrypted Shared Key**: The Document Key, encrypted either with the User's Public Key (if in the root) or with a Folder's Document Key (if in a folder).

## Relationships
- **Folder Membership**: A document belongs to a folder if its Document Key is encrypted using the folder's Document Key (creating a SharedKey issued by the `FOLDER`), AND its `documentId` is listed in the folder's encrypted JSON array content.
- **Root Membership**: A document is in the root directory if its Document Key is encrypted with the user's public key (issuer is the `USER`).
- **Group Membership**: A user is a member of a Group if a key entry issued for them is filed under the Group's Document. A document shared into a Group carries one key entry `{ issuer = group owner, kid = groupId }` wrapped with the Group Key, which every member reaches via an `Access-Path` through the Group.
