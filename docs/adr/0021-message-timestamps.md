# 21. Message Timestamps

Date: 2026-10-06

## Status

Accepted - implemented.

## Context

Messages carried no time, so the chat could neither show when something was
written nor separate days, and the chat list showed a placeholder date. The
content of a message is end-to-end encrypted, but the message id already is
`currentTimeMillis() + "-" + UUID`: the server knows the time of every message
and it is part of every file name.

## Decision

The **server** stamps a message when it accepts `POST .../messages` and stores
the timestamp in clear text next to the encrypted content.

- No additional metadata is disclosed: the id prefix already carries the same
  instant (`MessageId(Instant)` and `timestamp` come from one `Clock` reading).
- The server clock is trustworthy and monotonic enough to sort; a client clock
  can be wrong or manipulated.
- Format: ISO-8601 in UTC with fixed millisecond precision
  (`2026-10-06T14:03:12.481Z`, record `MessageTimestamp`).
- `POST` answers `201` with the `Location` header and a body
  `{ "id", "timestamp" }`, so the sender shows the server's time at once.
- `HEAD .../messages` returns the time of the newest message as `Last-Modified`
  (absent for an empty chat), guarded like `GET`. The chat list uses it for the
  date of the last activity.
- Every message has a timestamp: legacy messages stored without one derive it
  from the millisecond prefix of their id when read (ids always have the form
  `<epochMillis>-<uuid>`; an id without that prefix is a data error). No
  migration (ADR 0008).
- The chat list keeps the open chat's entry current from the messages the
  conversation already knows; other chats are looked up once via `HEAD`.

## Rejected

- An encrypted `sentAt` set by the client: it adds nothing the server does not
  know anyway and trusts the client clock. It can be added later, e.g. for
  offline sending.
- Both variants together.

## Consequences

- The chat list issues one `HEAD` per chat; a batch endpoint can replace it if
  that becomes too much.
- `Last-Modified` has second resolution, which suffices for a date display.
