# 20. Web Push Notifications

Date: 2026-09-27

## Status

Accepted - implemented. Supersedes the unmerged branch `browser-notification` (fb4a709).

## Context

Users only learn about new messages, contact requests, group invitations and
shared documents while the app is open on the right chat: messages arrive by
long polling (`MessageResource`, `wait=30`) of the one chat that is on screen.
We want real Web Push notifications that also arrive when the app or PWA is
closed.

Three properties of the system shape the design:

- **End-to-end encryption.** The server cannot read messages, contact names or
  group names. It can only push metadata; any preview has to be decrypted on
  the device, inside the service worker.
- **Hidden access graph (ADR 0009).** Key files store salted witnesses instead
  of issuers, so the server cannot enumerate who is a member of a chat or
  group. It cannot work out the recipients of a message by itself.
- **Keys at rest.** The service worker cannot read `localStorage`, where the
  device keys live. Only a "keep me logged in" device (ADR 0018, recovery key)
  can unlock its device key without the password; a device without it
  deliberately keeps no usable key at rest.

## Decision

1. **Standard Web Push with VAPID** (RFC 8030/8291/8292). The server holds a
   VAPID key pair from its configuration; without one, the feature is off and
   `GET /users/push/vapid-public-key` returns 404 (the JAX-RS application lives under `/users`). The payload is encrypted with
   JDK crypto only (ECDH P-256, HKDF, AES-128-GCM, ES256 JWT), tested against
   the RFC 8291 test vectors. No third-party web-push library.

2. **One subscription per device**, stored overwritable as
   `devices/{deviceId}/push-subscription.json` through
   `PUT/DELETE /users/{userId}/devices/{deviceId}/push-subscription`. Both
   require a session bound to that device (ADR 0018); the page binds it on
   demand (`withBoundSession`). The endpoint must be
   `https` on an allowlisted push host (configurable, default FCM, Mozilla,
   Apple, WNS), because the server sends POST requests to it. A 404/410
   response from the push service deletes the subscription.

   The push service may replace a subscription at any time
   (`pushsubscriptionchange`). The service worker cannot bind a session, so it
   only subscribes again. The page stores the new endpoint the next time the
   app starts for that account (`PushSubscriptionService.reconcile`): it
   compares the browser's endpoint with the one last stored for the device
   and, if they differ, stores it with a bound session. Devices cannot be
   deleted yet. Once they can, deleting a device must delete its subscription
   too.

3. **Metadata-only payloads.** The server never pushes plaintext:

   | Event | Origin | Payload |
   |---|---|---|
   | new message (incl. group invitation, shared document) | `POST .../messages` | `{type:"message", recipient, owner, chatId, messageId}` |
   | contact request received | `ContactService.invite` | `{type:"contact-request", recipient}` |
   | contact request accepted | `ContactService.acceptInvitation` | `{type:"contact-accepted", recipient}` |

   Group invitations and shared documents are chat messages. They are told
   apart only after decryption on the device, so the server never learns the
   message kind.

   `recipient` is the user id of the user the push is for. The push service
   decides which browser receives a push, not which account: a browser profile
   has exactly one push subscription per origin. When several accounts enable
   push in the same browser, they all store that one endpoint, and all their
   pushes reach the same service worker. `recipient` tells the service worker
   which account's keys to use. The server always sets it from the push event
   itself, never from a caller-supplied value. User ids are opaque
   pseudonyms (ADR 0005), and the payload is encrypted to the subscription, so
   `recipient` tells the push service nothing it could not already derive from
   the subscription.

4. **Client-asserted recipients.** When sending a message, the client names the
   users to notify in a `Notify` header (the other members of the chat). The
   server only pushes to users that pass the existing access check for this
   chat (`verifyAccess`/direct grant), so the header cannot be used to spam
   arbitrary users. Each entry must look like a user id
   (`[A-Za-z0-9_-]{1,64}`, otherwise 400): unlike a path segment, a header
   may contain `/` and `.`, and the ids end up in file names.
   Neither the sender nor the header is stored.
   Pushes are sent asynchronously (`@ObservesAsync`) and never delay or fail
   the message POST.

5. **Local decryption with a notification keyring.** On a "keep me logged in"
   device, the app keeps the following in IndexedDB, which the service worker
   can read:
   - a mirror of the recovery-encrypted device key (written together with the
     `localStorage` blob, so the two cannot drift apart), and
   - a **notification keyring**: `chatId -> {owner, chatKey, title, member
     names}`, encrypted under the device key pair. It is only kept while push
     is enabled on the device. The page adds a chat whenever it opens one and
     already holds its key. When it loads the chat list, it refreshes the
     contact names and, in the background, adds the chats that are still
     missing.

   The IndexedDB records are kept per device and looked up by `recipient`.
   A push for an account without a record there gets the generic text.

   On a push, the service worker fetches the recovery key (session cookie),
   unlocks the device key, decrypts the keyring, loads the message
   (`GET .../messages/{messageId}`) and shows the sender and a preview. If any
   step fails (no trusted device, session expired, chat not yet in the
   keyring, network), it shows a generic text instead: "Neue Nachricht",
   "Neue Kontaktanfrage" or "Kontaktanfrage angenommen".

6. **Suppression.** If a window that is actually visible
   (`visibilityState === "visible"`) already shows the chat, the service
   worker shows no notification: that window polls the chat itself. A chat
   open in a background tab still gets one. On WebKit, which revokes
   subscriptions after silent pushes, it always shows one.

## Consequences

- Push services (Google, Mozilla, Apple, Microsoft) see timing and size of
  pushes for a subscription, but no content: the payload is encrypted to the
  device and contains only ids.
- The server briefly learns the recipients of each message while handling the
  request. That is no more than it already sees from their polling requests,
  and nothing is stored, so ADR 0009 (at rest) still holds.
- The keyring holds only what the device key can already unlock from server
  data (chat keys, names). It is readable exactly when auto-login is, so it
  does not weaken the "keep me logged in" trade-off. Devices without it only
  ever show generic notifications.
- The service worker becomes a Vite build entry (`src/sw.ts`) so it can share
  `CryptoService`. Its push handler is written as a pure function so that
  Playwright can test it in page context, because the service worker is
  disabled under `vite dev`.
- Several accounts can use push in the same browser, but they share one
  browser subscription. Turning push off for one account deletes only its
  server-side subscription and its IndexedDB record; the browser subscription
  is only unsubscribed once no account uses it any more. Decrypted previews
  work only for the account whose session cookie is current; the others get
  the generic text.
- After the push service replaces a subscription, the server deletes the old
  one on the next 410. Until the user opens the app again (`reconcile`), that
  device receives no pushes. This follows from ADR 0018: only a page holding
  the device key can bind a session.
- Removing an account from a browser via "Not you?" happens without the
  device key, so the session cannot be bound and the server-side deletion is
  best effort. If no other account uses push in that browser, the browser
  subscription is unsubscribed and the next 410 removes it on the server. If
  other accounts still use it, the removed account keeps getting generic
  notifications until it turns push off on a device where it is signed in.
- iOS only delivers Web Push to an installed PWA (iOS 16.4+) and only after a
  permission request triggered by a user gesture.
- Cross-server federation (ADR 0013) is out of scope. Each server can only
  push to its own users.
