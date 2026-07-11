# 2. Persistent Device Authentication

Date: 2026-07-11

## Status

Proposed

## Context

Currently, users have to complete an email-based authentication challenge every time they log in or when their session token expires. This is tedious for users accessing the application frequently from their personal, trusted devices. 
We want to improve the user experience by reducing friction while maintaining security.

The requirement is:
* Authentication via email should only be necessary for **new/untrusted devices**.
* For a trusted device, if the authentication token has expired, the user only needs to enter their password.
* A "Trust this device" checkbox should be displayed during password entry so the user can control device trust.

We need to decide how to technical identify and persist the "Trust" state of a device on both the client (frontend) and the server (backend), and how this interacts with the existing `DeviceId` and Authentication Token.

## Decision

We will continue to use the `keepLoggedIn` (Trust this device) checkbox. Its purpose is to indicate whether the device is trusted:
1. **Trusted Device**: The token receives a longer expiration (e.g., 30 days). In addition, a `recoveryKey` is generated and stored locally/remotely to allow password-less `autoLogin` on page reload (while the token is valid).
2. **Untrusted Device**: The token receives a shorter expiration (1 hour). No recovery key is stored.

Password entry is only necessary when a token expires. Email authentication is only necessary for completely new devices.
The checkbox state is persisted in `localStorage` under `trustedDevice` so that the user's preference is remembered across password prompts.
The checkbox will be presented on all forms of password entry: initial registration, device registration, device setup, and token expiration challenges.
If checked during any of these steps, we actively call the challenge endpoint to issue a 30-day token and save the recovery key.

## Consequences

- Improved user experience for trusted devices (token lasts 30 days).
- The checkbox is decoupled from the immediate authentication mechanism but configures the session duration and auto-login capability.
