# ADR 0003: Cryptographic Hashing for User Email Mapping

## Status
Accepted

## Context
We are replacing plaintext email addresses with UserIds (UUIDs) and storing a mapping of `hashed(email) -> UserId` in `user-ids.json`. We need to define the hashing mechanism.
A simple hash (e.g., SHA-256) is vulnerable to rainbow table attacks because email addresses are predictable. 
A standard salted password hash (e.g., bcrypt, Argon2 with a random per-user salt) is unsuitable here: to find a user by their email, the server would have to hash the provided email against every single salt in the database until a match is found, which is computationally infeasible. The hash must be deterministic.

## Decision
We will use **HMAC-SHA256** (Hash-based Message Authentication Code) with a **Global Secret Key (Pepper)** to hash the email addresses.

1.  **Algorithm:** HMAC-SHA256 provides a deterministic output. The same email with the same key will always yield the same hash, allowing direct O(1) lookups in the JSON file.
2.  **The Pepper (Secret Key):** The HMAC requires a high-entropy secret key (at least 256 bits). This key will NOT be stored on the filesystem alongside `user-ids.json`. It must be injected into the application at runtime via an environment variable or a secure secrets manager.

## Consequences
*   **Positive:** The mapping file is secure against offline dictionary and rainbow table attacks. Even if an attacker steals `user-ids.json`, they cannot reverse the hashes without the Pepper. O(1) lookup performance is maintained.
*   **Negative:** If the Pepper is compromised alongside the file, the emails can be brute-forced. If the Pepper is lost, all user mappings are permanently unreadable, effectively locking all users out of the system. The Pepper becomes critical infrastructure state.
