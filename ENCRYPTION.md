# Imagey Cloud Encryption Protocol

Imagey Cloud employs a strict End-to-End Encryption (E2EE) and Zero-Knowledge architecture. The server never has access to unencrypted document contents, metadata, or the encryption keys required to decrypt them. All encryption and decryption operations are performed entirely on the client side.

Below is a detailed overview of the cryptographic protocols and algorithms used.

## 1. User Identity & Key Management

An account is identified on the server by an opaque **UserId** (a random UUID assigned the first time an email address is seen), never by the address itself. The address is resolved to a UserId through a keyed-hash lookup table (`user-ids.json`, HMAC-SHA256 keyed by a runtime pepper); it is otherwise stored only inside the client-encrypted profile document. See ADR 0005-0008.

Every user identity is backed by a two-tiered asymmetric key architecture (ECDH `P-256`): a **Device Key Pair** and a **Main (User) Key Pair**.

### A. Device Key Pair (Per Device)
- **Generation:** Generated locally whenever a user sets up a new device or registers.
- **Private Key Protection:** The Private Device Key never leaves the device. It is encrypted symmetrically using **AES-GCM (256-bit)**. The symmetric key is derived from the user's password using **PBKDF2** (HMAC-SHA-256, 250,000 iterations), using the `deviceId` as the cryptographic salt. The encrypted Private Device Key is stored *locally* on the device (e.g., in `localStorage`).
- **Server Storage:** The Public Device Key is uploaded to the server.

### B. Main / User Key Pair (Per User)
- **Generation:** Generated once when the user registers their first device. This is the primary identity key used to share documents with other users.
- **Private Key Protection:** The Private Main Key is encrypted using an ECDH key agreement. Specifically, it is encrypted via **AES-GCM** using a shared secret derived from the *Private Device Key* of the encrypting device and the *Public Device Key* of the target device. 
- **Server Storage:** The server stores the Public Main Key and the *Encrypted* Private Main Key (which is specifically encrypted for the user's authorized devices).

### C. Authentication / Login Flow
1. The user enters their password on their device.
2. The device derives the symmetric key via PBKDF2 and decrypts its local **Private Device Key**.
3. The device fetches the **Encrypted Private Main Key** from the server.
4. Using its Private Device Key, it derives the ECDH shared secret to decrypt the **Private Main Key**.
5. The decrypted Private Main Key is then kept in memory to encrypt and decrypt document shares.

### D. Adding a New Device (Activation)
When the user logs in from a *new* device, it must be activated by an *existing* unlocked device:
1. The new device generates a Device Key-Pair and stores the password-encrypted Private Device Key locally. It uploads its Public Device Key.
2. The user uses an existing unlocked device to view pending devices.
3. The unlocked device fetches the new device's Public Device Key.
4. The unlocked device encrypts the Private Main Key using the new device's Public Device Key.
5. The newly encrypted Private Main Key is uploaded to the backend, tied to the new device ID.
6. The new device can now fetch this blob and decrypt it using its own Private Device Key.

## 2. Document Encryption

Documents and their associated metadata are encrypted using symmetric cryptography for performance and size efficiency.

- **Symmetric Key Generation:** When a user uploads a new document, the client generates a unique, random **AES-GCM (256-bit)** symmetric key (the "Document Key").
- **Content Encryption:** All document assets (the main image, the small preview, and the thumbnail) are independently encrypted using the Document Key. A random 12-byte Initialization Vector (IV) is generated for each asset and prepended to the resulting ciphertext.
- **Metadata Encryption:** The document's metadata (a JSON object) is also serialized into bytes and encrypted using the same Document Key and a random 12-byte IV. The resulting ciphertext is Base64-encoded and stored as an `encryptedData` string.
- **Server Storage:** The server receives and stores the completely opaque encrypted binaries and the Base64 metadata string. It does not know the true file types, sizes, or names.

## 3. Key Sharing & Document Access

To allow users (including the owner themselves on different devices) to read a document, the symmetric Document Key must be securely distributed to them.

- **Key Wrapping:** A document's Document Key is wrapped by the key of its *parent*: the folder it lives in (Root-Folder Key, sub-folder key, …), or — when shared into a chat — the chat's key. Folder/chat keys are wrapped symmetrically (**AES-GCM**, random 12-byte IV prepended); a key handed to another user's account is wrapped via **ECDH** (sender's Private Key + recipient's Public Key).
- **Server Storage (ADR 0009):** Each wrapped key is one JSON file `documents/{documentId}/keys/{H}.json` where the file name `H = base64url(HMAC(K_name, documentId || kid))` is a function of *both* endpoints, and the content is `{salt, witness, sharedKey}` — no plaintext `issuer` / `kid`. `witness = base64(HMAC(K_witness, salt || issuer || kid))` with a fresh per-file `salt`; `K_name` / `K_witness` derive from the runtime pepper `document.mapping.secret`. `issuer` is the **UserId** of the account whose wrapping key it is; `kid` is the parent document's id (folder/chat), `"0"` (a document's own self key), or a recipient's **UserId**. An offline reader without the pepper cannot join child to parent or group siblings; with the pepper they can only guess-test 122-bit UUIDs. Slots are **write-once** (`POST .../keys`, create-only): re-filing an occupied slot with a *different* `sharedKey` is a `409` (the `salt` / `witness` differ on every write, so only `sharedKey` is compared).
- **Roles:** The server knows only two roles. The **owner** is the account in the URL path. A **member** is an account with a *direct grant* on the document — a key file whose `witness` matches the self-referential `(caller, caller)` pair, which is how every folder / chat / recipient share is filed — or, for a document reached transitively *through* a shared folder, an account that supplies a valid **`Access-Path`** header: a chain of `{doc, owner, wrappedBy}` hops, each verified against the stored witnesses, terminating either in a direct grant or in a hop the caller owns. `MAX_HOPS = 32`; a malformed / oversize header is `400`, a well-formed chain with no terminus is `403`. A member may read the document and its files, and may `POST` a new document into a folder they belong to (it lands in *their* tree, the folder's content update in the folder owner's); only the owner may `PUT`.
- **Individual Encryption:** A key wrapped via ECDH is unique to the sender–recipient pair, so it must be wrapped individually for every account granted direct (non-folder) access.

## 4. Document Decryption

When an authorized user wants to access a document:

1. **Fetch Encrypted Data:** The client fetches the encrypted document metadata and the wrapped key (`GET documents/{id}/keys/{kid}`, response `{ sharedKey }` — the client already knows `kid` and tracks the owner). For a document reached through a contact's shared folder it sends the `Access-Path` chain header it built while walking down from the Root-Folder.
2. **Obtain the Wrapping Key:** If the key was wrapped by a folder/chat key, the client already holds that key (it walked down from the Root-Folder). If it was ECDH-wrapped for this account, the client derives the shared secret from its own **Private Key** and the issuer's **Public Key**.
3. **Unwrap Document Key:** The client decrypts the `sharedKey` via **AES-GCM**, recovering the symmetric Document Key.
4. **Decrypt Content:** Finally, the client uses the Document Key to decrypt the Base64 metadata JSON and the actual document binaries for display. Content lives in the owner's namespace, which the client tracks separately from the key's `issuer`.

## 5. Contact Requests and Chat

Contacts and chats are, like everything else the user owns, also
represented as an encrypted `Document`: each user has a "chats" Document
(referenced from their Settings document, alongside the root document
folder and the profile) whose decrypted content is a
`contacts: { userId, chatId, owner }[]` array instead of a dedicated
`/users/{id}/contacts` listing endpoint. `owner` is whichever party created
the chat Document (see step 2 below) and is needed to know how to unwrap
its key later (step 4).

A **chat has no separately generated symmetric key** - the chat's shared
key *is* the chat Document's own Document key. Access to a chat is granted
like access to any other Document: each party has a key entry, wrapped
under their *own* "chats" Document key, filed under the chat Document in
the owner's tree with themselves as `issuer`. The owner files theirs when
creating the chat; the other party's is delivered ECDH-wrapped in the
handshake, re-wrapped by them under their own "chats" key, and **synced by
the server** into the owner's tree (step 3). Both parties always reach the
chat - messages and in-chat shared documents - through the owner's
namespace (`Contact.owner`).

Contact requests are tracked separately, as a transient handshake record -
they are not the durable contact list; they are deleted by the server once
the handshake completes.

1. **Send Request:** User A (the inviter) sends a contact request via
   `POST /users/{A-userId}/contact-requests` with `{ invitee: B's email,
   inviterEmail: A's email, publicKey: A's public main key }`. The server
   resolves (or mints) B's **UserId** so the pending request can be filed
   in B's tree straight away, and stores it with status `INVITED`.
   `inviterEmail` is used only to name A in the invitation mail sent to a
   not-yet-registered B and is not stored. A's public main key is kept on
   the request itself, so accepting it never needs a separate public-key
   fetch. If B has no account yet, the server emails B an
   `/invitations/{token}` link (`token` carries B's email as subject);
   following it, `InvitationFilter` mints B's UserId and redirects into the
   SPA with `?email=B&userId=<B's UserId>&inviter=<A's UserId>`, and
   accepting the request is the last step of B's registration (see
   `RegistrationDialog` / `AuthenticationService.register`).
2. **Accept Request:** User B (the invitee) fetches their pending requests
   via `GET /users/{B-userId}/contact-requests` and accepts, or - if B just
   registered via an invite link as described above - accepts as the last
   step of registration instead. Accepting:
   - Creates a new, empty chat Document as a child of B's own "chats"
     Document, generating a fresh Document Key for it exactly as for any
     other document, and self-issuing B's own access to it (wrapped under
     the "chats" Document's key).
   - Appends `{ userId: A, chatId, owner: B }` to B's own "chats" Document
     contacts array, which is then re-encrypted and re-uploaded (the same
     multipart `POST /users/{id}/documents` call used for creating a
     folder).
   - ECDH-wraps the same chat Document key for A, using A's public main
     key (from the request) and B's own private main key.
   - Sends `PUT /users/{B}/contact-requests/{A}` with
     `{ inviter: A, invitee: B, publicKey: B's public main key, chatId,
     sharedKey: <ECDH-wrapped chat key> }`. The server moves the request to
     status `ACCEPTED` and overwrites `publicKey` with B's (so A can later
     derive the same ECDH shared secret B used to wrap `sharedKey`).
3. **Pick Up the Chat Key:** User A polls `GET /users/{A}/contact-requests`
   and finds the request now `ACCEPTED`. A decrypts `sharedKey` (ECDH,
   using B's public key from the request and A's own private key),
   **re-wraps the chat key symmetrically under A's own "chats" Document
   key**, appends `{ userId: B, chatId, owner: B }` to A's own "chats"
   Document contacts array (re-encrypted/re-uploaded the same way), and
   confirms receipt via `PUT /users/{A}/contact-requests/{B}` with
   `{ inviter: A, invitee: B, status: "RECEIVED",
   chatKey: { issuer: A, kid: <A's chats doc id>, sharedKey: <re-wrapped> } }`.
   The server files `chatKey` under the chat Document in **B's** tree
   (`documents/{chatId}/keys/{A}`, issuer `A`) - this is what grants A the
   `member` role on the chat from then on - and deletes the request. Both
   sides now have their own durable copy of the contact and their own
   key entry.
4. **Loading the Chat Key (either side, any time after):** To open a chat,
   a user looks up the matching `Contact` entry (`{ userId, chatId, owner
   }`) in their own decrypted "chats" Document, then fetches their key
   entry from the owner's tree - `keys/{chatId's parent}` if they own the
   chat, `keys/{self}` if not - and unwraps it symmetrically with their own
   "chats" Document key. No ECDH is involved at open time either way.
5. **Decline:** `DELETE /users/{B}/contact-requests/{A}` removes an
   `INVITED` request User B does not want to accept.

## Cryptographic Primitives Summary

- **Asymmetric Cryptography:** ECDH (Elliptic Curve Diffie-Hellman) with curve `P-256`.
- **Symmetric Cryptography:** AES-GCM with 256-bit keys and 12-byte random IVs.
- **Key Derivation (Password):** PBKDF2 with HMAC-SHA-256, 250,000 iterations.
- **Key Formatting:** JSON Web Key (JWK).
