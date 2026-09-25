# 16. Encrypted Contact Info on Contact Requests

Date: 2026-09-25

## Status

Accepted - implemented 2026-09-25. Extends ADR 0015.

## Context

Contacts and invitations were shown by the other party's `UserId` - an opaque
UUID (ADR 0005) that means nothing to a person. They should instead show the
other party's **display name** as the main label and their **email address**
as the secondary one.

For an established chat, the display name comes from the other party's
public profile (docs/plans/chat-public-profile.md). But:

- An **invitee** cannot read the inviter's public profile before accepting:
  it is only shared into the chat with the chat key, which exists from leg 2
  (ADR 0015) on.
- The inviter's client cannot encrypt anything for the invitee at invite
  time: it does not know the invitee's public key, and a lookup would reveal
  who is registered (ADR 0015, Context).
- The server does not know anyone's address in plaintext (ADR 0007).
  `inviterEmail` is only used for the invitation mail and never stored.
- The inviter knows the invitee's address (they typed it), but does not keep
  it, and the public profile has no address.

## Decision

`ContactExchange` gains an optional `contactInfo`: the JSON
`{"name": ..., "email": ...}` of the **sender of the latest transition**,
AES-GCM encrypted by their client and opaque to the server (same semantics as
`publicKey`/`publicProfileId`):

| Status | Sender | Key |
|---|---|---|
| `INVITED` | Inviter | `HKDF-SHA-256(ikm = lowercase(inviteeEmail), salt = <empty>, info = "imagey-invitation-key" 0x00 chatId)` |
| `ACCEPTED` | Invitee | the chat key (ADR 0015 decision 1) |

`RECEIVED` and `DENIED` keep the value of the transition before them.

- The invitee derives the invitation key from the address they signed in
  with, so they can show the inviter's name and address before accepting.
  When they accept, they copy both into their `ContactEntry` (`name`, new
  optional `email`).
- The inviter reads the invitee's name and address in leg 3 with the chat
  key they derive anyway, and copies both into their own `ContactEntry`.
- From then on, the chat list shows `ContactEntry.name`. The chat view keeps
  it in sync with the public profile, as before. Below the name, the list
  shows `ContactEntry.email`. It never shows a `UserId`: if nothing else is
  known, it shows "Unknown contact".

## Consequences

- The server stores neither names nor addresses in plaintext.
- The invitation key only protects the inviter's info from someone who does
  not know or cannot guess the invitee's address. Addresses are
  low-entropy, and the server sees the invitee's address in plaintext
  during the invite request anyway. This is deliberately a "not in plaintext
  at rest" measure, not end-to-end secrecy against the server. The `ACCEPTED`
  info is protected by the chat key like any other chat content.
- If the invitee signs in with a different address than the one they were
  invited with (or none is known to the client), the inviter's info cannot be
  decrypted. The invitation then shows "Unknown contact", and the name is
  filled in from the public profile once the chat is opened.
- Existing contact entries keep their `UserId` placeholder as name until
  their chat is opened. It is never displayed as such. Per ADR 0008, nothing
  is migrated.
