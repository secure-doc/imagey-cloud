# Domain Glossary

This document contains definitions for the ubiquitous language used in the Imagey domain, specifically around authentication and device management.

## Authentication & Devices

*   **Device**: A logical representation of a client (browser, mobile app) used by a user to access the application.
*   **Trusted Device**: A device that has been previously authenticated and explicitly trusted by the user. On a trusted device, a session expiration only requires password authentication, skipping the email challenge.
*   **New Device / Untrusted Device**: A device that has not been authenticated or was not explicitly trusted by the user. Requires the full authentication flow including an email challenge.
*   **Email Authentication / Challenge**: The process of verifying ownership of an email address by sending a challenge (e.g., a one-time code or magic link).
*   **Password Authentication**: The process of a user providing their password to unlock their private key or authenticate to a new session.
*   **Authentication Token**: A short-lived token (e.g., JWT) that proves the user's active session. When it expires, re-authentication is required.
