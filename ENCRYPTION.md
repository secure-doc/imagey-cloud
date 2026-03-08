# Imagey Cloud Encryption Protocol

Imagey Cloud employs a strict End-to-End Encryption (E2EE) and Zero-Knowledge architecture. The server never has access to unencrypted document contents, metadata, or the encryption keys required to decrypt them. All encryption and decryption operations are performed entirely on the client side.

Below is a detailed overview of the cryptographic protocols and algorithms used.

## 1. User Identity & Key Management

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

## 2. Document Encryption

Documents and their associated metadata are encrypted using symmetric cryptography for performance and size efficiency.

- **Symmetric Key Generation:** When a user uploads a new document, the client generates a unique, random **AES-GCM (256-bit)** symmetric key (the "Document Key").
- **Content Encryption:** All document assets (the main image, the small preview, and the thumbnail) are independently encrypted using the Document Key. A random 12-byte Initialization Vector (IV) is generated for each asset and prepended to the resulting ciphertext.
- **Metadata Encryption:** The document's metadata (a JSON object) is also serialized into bytes and encrypted using the same Document Key and a random 12-byte IV. The resulting ciphertext is Base64-encoded and stored as an `encryptedData` string.
- **Server Storage:** The server receives and stores the completely opaque encrypted binaries and the Base64 metadata string. It does not know the true file types, sizes, or names.

## 3. Key Sharing & Document Access

To allow users (including the owner themselves on different devices) to read a document, the symmetric Document Key must be securely distributed to them.

- **ECDH Key Agreement:** To share the Document Key with a recipient, the sender performs an ECDH key agreement. They combine their own **Private Key** with the recipient's **Public Key** to derive a strong, shared secret key.
- **Key Wrapping:** The Document Key (serialized as a JSON Web Key) is then encrypted using this derived shared secret via **AES-GCM** (with a random 12-byte IV prepended).
- **Server Storage:** The server stores this encrypted key blob specifically for the recipient in the `shared-keys/{recipient-email}/encrypted-shared.key` file.
- **Individual Encryption:** Because the shared secret is unique to the sender-recipient pair, the Document Key must be individually encrypted (wrapped) for *every* user who has access to the document.

## 4. Document Decryption

When an authorized user wants to access a document:

1. **Fetch Encrypted Data:** The client fetches the encrypted document metadata and their individually encrypted `sharedKey` from the API.
2. **Derive Shared Secret:** The recipient uses their own **Private Key** and the sender's **Public Key** to perform the ECDH key agreement. Because ECDH is symmetric in its derivation, this produces the exact same shared secret that the sender generated.
3. **Unwrap Document Key:** The client uses the shared secret to decrypt their `encrypted-shared.key` via **AES-GCM**, recovering the symmetric Document Key.
4. **Decrypt Content:** Finally, the client uses the Document Key to decrypt the Base64 metadata JSON and the actual document binaries for display.

## Cryptographic Primitives Summary

- **Asymmetric Cryptography:** ECDH (Elliptic Curve Diffie-Hellman) with curve `P-256`.
- **Symmetric Cryptography:** AES-GCM with 256-bit keys and 12-byte random IVs.
- **Key Derivation (Password):** PBKDF2 with HMAC-SHA-256, 250,000 iterations.
- **Key Formatting:** JSON Web Key (JWK).
