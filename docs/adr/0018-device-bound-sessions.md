# 18. Device-Bound Sessions

Date: 2026-09-26

## Status

Accepted - implemented, see `docs/plans/device-bound-sessions.md`.

## Context

A session cookie (`AUTHENTICATION` token, `TokenService`) names the user, but
not the device it belongs to. It can come from two very different places:

- an emailed login, registration or invitation link - proves access to the
  mailbox, nothing more;
- a device challenge (`ChallengeResource.verifyChallenge`) - proves possession
  of the private key of one registered device.

Both end up as the same `owner` session, so the server cannot tell them apart.
Three device endpoints change what a device *is* and are open to every `owner`
session today:

| Endpoint | What an email-only session can do |
|---|---|
| `PUT .../devices/{id}/info` (ADR 0017) | overwrite the info of any device with garbage (it is then listed by its id) or with an older blob |
| `POST .../devices/{id}/private-keys` | "activate" a pending device with a garbage key first - the file is create-only, so the device is bricked for good |
| `POST .../devices/{id}/recovery-key` | overwrite the recovery key of any device - its auto-login then fails until the user enters the password again |

None of them lets an attacker read or forge anything, but all of them let
someone with access to the user's mailbox damage the user's devices.

Many legitimate sessions are not bound to a device either: unlocking a device
without "keep me logged in" (`DeviceSetupDialog`) decrypts the local device key
with the password and keeps using the session from the email link.

## Decision

1. **Device claim.** `AUTHENTICATION` tokens get an optional claim `device`
   (the `DeviceId`). Only `ChallengeResource.verifyChallenge` sets it, to the
   device whose challenge was answered. The sliding refresh of a trusted
   session (`AuthenticationTokenRefreshFilter`) carries it over unchanged. The
   email-link filters never set it. A session with the claim is *bound* to
   that device.

2. **Authorization.** On top of `@RolesAllowed("owner")`, checked on every
   request (not when the token is issued, so a device that is activated later
   qualifies from then on):

   | Endpoint | Allowed when |
   |---|---|
   | `PUT .../devices/{id}/info` | the session is bound to an **activated** device, **or** the target is not activated and has no info yet (the one write of a newly registered device, made on the email session) |
   | `POST .../devices/{id}/private-keys` | the session is bound to an **activated** device D, the body's `encryptingDeviceId` is D, and the target is registered |
   | `POST .../devices/{id}/recovery-key` | the session is bound to **the target device itself** |

   Everything else is rejected with 403. The target must be registered
   (404 otherwise), as for the info today.

   The recovery key only matters to the device it belongs to, and that device
   always stores it right after its own challenge, so it does not need to be
   activated.

3. **Binding on demand.** The client does not bind every session up front.
   When one of these writes is rejected with 403, it binds the session and
   retries once: it answers a challenge with the private device key it already
   holds in memory after unlock, so the user is not asked for the password
   again. The challenge is requested with `trusted` = the current "keep me
   logged in" choice, so a trusted session is not downgraded. Binding does
   **not** rotate the recovery key - only a sign-in with the password does.

4. The device verification code announced in ADR 0017 is a separate change.

## Consequences

- A session from the mailbox alone can no longer rename, activate or break
  devices. It can still register a new device and describe it as it likes;
  the verification code (ADR 0017) is meant to close that.
- The server can now attribute these writes to a device. It still cannot read
  or forge device infos.
- Unlocking a device stays one round trip; the extra challenge is only paid by
  the first rename or activation of an unbound session.
- `GET .../recovery-key` stays open to every `owner` session. The server-side
  recovery key is useless without the local blob on the device, and restricting
  it would force a password prompt whenever a device signs in through an
  emailed link.
- Sessions issued before this change carry no claim. There is no production
  data to migrate (ADR 0008); such a session is bound on demand like any other.
