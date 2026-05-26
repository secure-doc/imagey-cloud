# Imagey End-to-End Encryption Protocol

This document details the encryption architecture for Imagey. It outlines how user data and documents are securely shared across multiple devices and contacts, utilizing an end-to-end encryption strategy.

## Key Terminology and Architecture

Our security model relies on a two-tiered key structure to maintain both extreme security across devices and practical usability when sharing with contacts.

### 1. The User Key-Pair (Main Key-Pair)
- **Scope:** One per user.
- **Purpose:** Used for sharing data with other users. It establishes a user's cryptographic identity in the system.
- **Characteristics:**
  - The **Public Main Key** is published to the backend and can be retrieved by other users (e.g., when accepting a contact request).
  - The **Private Main Key** is NEVER stored in plaintext. It is encrypted individually for every device the user owns.

### 2. The Device Key-Pair
- **Scope:** One per physical device/browser.
- **Purpose:** Exclusively used to encrypt and decrypt the user's **Private Main Key**.
- **Characteristics:**
  - The **Public Device Key** is stored on the backend to allow other devices (or the current device) to encrypt the Private Main Key for it.
  - The **Private Device Key** is stored locally in the device's `localStorage`. It is additionally encrypted using the user's login password.

---

## Operations & Cryptographic Flows

### A. Device Registration and User Onboarding
1. **Initial Device Setup:**
   - A new Device Key-Pair is generated.
   - The user inputs their password. The Private Device Key is encrypted symmetrically with this password and stored in `localStorage`.
   - The Public Device Key is sent to the backend.
2. **First-time Registration:**
   - A new User Key-Pair (Main Key-Pair) is generated.
   - The Private Main Key is symmetrically encrypted using the newly generated Public Device Key (so only this device can decrypt it later).
   - The encrypted Private Main Key and the Public Main Key are stored on the backend.

### B. Device Authentication (Unlocking)
When a user logs in on an existing device:
1. The user enters their password.
2. The encrypted Private Device Key is loaded from `localStorage` and decrypted using the password.
3. The backend provides the encrypted Private Main Key for this specific device.
4. The device uses its decrypted Private Device Key to decrypt the Private Main Key.
5. The user is now authenticated and can decrypt their documents.

### C. Adding a New Device (Activation)
When the user logs in from a *new* device, it must be activated by an *existing* unlocked device:
1. The new device generates a Device Key-Pair and stores the password-encrypted Private Device Key locally. It uploads its Public Device Key.
2. The user uses an existing unlocked device to view pending devices.
3. The unlocked device fetches the new device's Public Device Key.
4. The unlocked device encrypts the Private Main Key using the new device's Public Device Key.
5. The newly encrypted Private Main Key is uploaded to the backend, tied to the new device ID.
6. The new device can now fetch this blob and decrypt it using its own Private Device Key.

### D. Document Encryption and Sharing
*Note: This flow applies to any user data (e.g., images, profiles).*

**Encrypting a Document:**
1. A symmetric **Document Key** is generated for the specific document.
2. The document contents and metadata are encrypted using this Document Key.
3. The Document Key is encrypted using the user's Public Main Key.
4. The encrypted document, encrypted metadata, and the encrypted Document Key are uploaded.

**Accessing a Document:**
1. The user fetches the encrypted Document Key.
2. The user decrypts the Document Key using their Private Main Key.
3. The user decrypts the document using the decrypted Document Key.

**Sharing a Document (Future/Refined Scope):**
- **Issue:** Currently, the encrypted Document Key (Shared Key) might be stored within the document's metadata. This is inefficient for sharing, as the metadata would need to be rewritten or structured to contain an array of encrypted keys for every allowed user.
- **Solution:** The metadata itself should be treated as part of the encrypted payload blob. Access control and shared keys should be handled relationally on the backend (e.g., a `DocumentAccess` table). For every user granted access, the Document Key is encrypted with their Public Main Key and stored in this relational structure.

### E. Contact Requests and Connections
1. User A sends a contact request to User B.
2. User B accepts. User B fetches User A's Public Main Key.
3. User B generates a symmetric Shared Contact Key (used for chat/messaging between the two).
4. User B encrypts this Shared Contact Key using User A's Public Main Key and sends it back.
5. Both users now possess a secure shared key for direct communication.
