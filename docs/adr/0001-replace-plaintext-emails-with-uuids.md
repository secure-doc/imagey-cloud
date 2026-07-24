# ADR 0001: Replace Plaintext Emails with UUIDs

## Status
Accepted

## Context
Currently, the system stores user email addresses in plaintext on the server. This poses a privacy and security risk if the server is compromised or accessed by unauthorized personnel. We need a way to identify users without exposing their email addresses in plaintext across the system. 

## Decision
We will replace all plaintext email addresses with universally unique identifiers (UUIDs) as the primary user identification (`UserId`) across the server. Email addresses will be hashed, and a mapping file (`user-ids.json`) will be maintained to resolve a hashed email back to its corresponding `UserId`.

## Consequences
*   **Positive:** Enhanced privacy and security. Plaintext emails are no longer stored on the server's filesystem.
*   **Negative:** Increased complexity in operations and support, as resolving a user by email now requires an explicit hashing step. Changing an email address requires updating the mapping file.
*   **Security Requirement:** The hashing mechanism must use a strong algorithm with a salt (or pepper) to prevent dictionary and rainbow table attacks.
