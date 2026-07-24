# ADR 0004: No Production Data Migration

## Status
Accepted

## Context
We are transitioning the primary user identifier from plaintext email addresses to UserIds (UUIDs). This requires restructuring the underlying file storage, as user directories currently use the plaintext email as the directory name. 
We need to decide how to handle existing production data during deployment.

## Decision
We will **not** implement an automated migration script for existing production data. Production data will either be started fresh or handled manually out-of-band. 
However, all checked-in test data (in both the server and client repositories) must be fully migrated to the new UUID-based structure to ensure the test suites pass.

## Consequences
*   **Positive:** Simplifies the deployment process by avoiding complex, error-prone, on-the-fly migration scripts that could corrupt data.
*   **Negative:** Existing users in production will lose their data if they are not manually migrated by an administrator before the update.
