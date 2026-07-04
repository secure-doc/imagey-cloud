# Glossary

* **Main Key Pair**: The asymmetric key pair associated with a user's account. The private key is encrypted with the user's active device key.
* **Settings**: A special document that holds user configuration. It is symmetrically encrypted using the **Settings Key**.
* **Settings Key**: A symmetric key used to encrypt the Settings document. This key is itself asymmetrically encrypted using the **Main Key Pair** and stored on the server.
* **Root-Folder**: A default folder assigned to every user to hold their documents. The ID of this folder is stored in the `documents` attribute of the **Settings** document.
* **Root-Folder Key**: A symmetric key used to encrypt the contents of the Root-Folder and the keys of the documents within it. It is encrypted using the **Settings Key**.
* **Document Key**: A symmetric key generated for each uploaded document. It is encrypted using the symmetric key of the folder (e.g., **Root-Folder Key**) where the document is located.
