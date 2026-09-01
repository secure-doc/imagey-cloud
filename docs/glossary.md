# Glossary

* **UserId**: The opaque primary identifier of an account - a random UUID assigned once, the first time an email address is seen. Replaces the plaintext email address as the account's identity everywhere on the server: the storage directory name, the `{userId}` URL segment, the authenticated-session JWT subject, and the `issuer` of a shared key (see ADR 0005).
* **User Mapping**: The lookup from a `HMAC-SHA256(email)` to its **UserId**, held in **user-ids.json** and served by `UserMappingService` (see ADR 0006/0007).
* **user-ids.json**: The single JSON file at the root of `root.path` holding the **User Mapping**. Its keys are keyed hashes of email addresses, never plaintext.
* **Pepper**: The global high-entropy secret (`user.mapping.secret`) keying the HMAC used for the **User Mapping**. Injected at runtime, never stored next to `user-ids.json`; losing it locks every user out (ADR 0007).
* **Main Key Pair**: The asymmetric key pair associated with a user's account. The private key is encrypted with the user's active device key.
* **Settings**: A special document that holds user configuration. It is symmetrically encrypted using the **Settings Key**.
* **Settings Key**: A symmetric key used to encrypt the Settings document. This key is itself asymmetrically encrypted using the **Main Key Pair** and stored on the server.
* **Root-Folder**: A default folder assigned to every user to hold their documents. The ID of this folder is stored in the `documents` attribute of the **Settings** document.
* **Root-Folder Key**: A symmetric key used to encrypt the contents of the Root-Folder and the keys of the documents within it. It is encrypted using the **Settings Key**.
* **Document Key**: A symmetric key generated for each uploaded document. It is encrypted using the symmetric key of the folder (e.g., **Root-Folder Key**) where the document is located.
