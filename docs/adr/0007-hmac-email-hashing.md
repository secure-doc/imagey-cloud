# 7. HMAC-SHA256 with a Pepper for the Address Lookup

Date: 2026-09-01

## Status

Accepted

## Context

`user-ids.json` (ADR 0005/0006) maps an email address to its `UserId`. We need
the key of that map to not be the plaintext address, or a stolen file would leak
the whole user list. The lookup must still be O(1): the server is given an
address and must find its id directly.

- A bare hash (SHA-256) of an address is trivially reversed with a dictionary or
  rainbow table - addresses are low-entropy and guessable.
- A per-entry salted password hash (bcrypt/Argon2) cannot be looked up: the
  server would have to try every salt in the file. The hash must be
  deterministic.

## Decision

Hash the address with **HMAC-SHA256** keyed by a global secret **pepper**
(`user.mapping.secret`, >= 256 bits), URL-safe-Base64 without padding as the map
key. The same address always yields the same key, so the lookup stays O(1). The
pepper is injected at runtime (environment variable / secret manager) and is
**never** stored next to `user-ids.json`.

## Consequences

- **Positive:** an attacker who steals only `user-ids.json` cannot recover any
  address without also stealing the pepper.
- **Negative:** if the pepper leaks together with the file, the addresses can be
  brute-forced (they are low-entropy). If the pepper is *lost*, every mapping is
  unresolvable and all users are locked out - the pepper is critical
  infrastructure state and must be backed up like a signing key.
- Tests use a fixed pepper (`test-user-mapping-pepper`) so the `user-ids.json`
  fixture's keys are reproducible.
- `user.mapping.secret` has **no default**: the server refuses to start if it is
  unset, rather than silently running with a guessable pepper.
