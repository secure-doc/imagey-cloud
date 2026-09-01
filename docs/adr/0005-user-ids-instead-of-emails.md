# 5. Identify Accounts by UserId, Not Email

Date: 2026-09-01

## Status

Accepted

## Context

The server identified every account by its plaintext email address: it was the
name of the storage directory (`<root.path>/<email>`), the `{email}` segment of
almost every URL, the JWT subject of an authenticated session, the `issuer` of a
shared key, and the `sender` of a chat message. A stolen or mis-handled data
directory therefore exposed the full list of users' email addresses, and the
addresses travelled in access logs and browser history through the URLs.

An earlier attempt at this change (`origin/user-ids`) predated the folder
encryption refactoring (ADR 0001-0004) and could not be merged; this ADR
re-establishes its decisions on the current codebase.

## Decision

The primary identifier of an account is an opaque **`UserId`** - a random UUID
assigned once, the first time an address is seen. It replaces the email address
everywhere the server used one as an identifier:

- storage directory: `<root.path>/<userId>`
- URL path segment: `{userId}` (the JAX-RS resources, `RolesFilter`)
- authenticated-session JWT subject
- `EncryptedSharedKey.issuer`, `Message.sender`, `ContactExchange.inviter` / `invitee`
- the settings document's id, and the `kid` of the documentList / chatList /
  profile self-keys and of a server-synced chat key

The email address survives only as:

- the input to the pre-authentication endpoints that a user reaches before they
  know their own id: `POST /users/verifications` (JSON body), and the
  `subject` of the registration / login / invitation tokens in the emailed links
- one field of the client-encrypted profile document (`{"emails": [...]}`), which
  the server never reads
- a display value the SPA keeps from the `?email=` redirect parameter

Resolving an address to its `UserId` is done through a keyed-hash lookup table -
see ADR 0006 (concurrency) and ADR 0007 (hashing).

## Consequences

- **Positive:** a stolen data directory no longer reveals any email address;
  addresses no longer appear in URLs, logs or history.
- **Negative:** operations and support can no longer identify a user by reading a
  directory name; resolving a user by address needs the `UserMappingService` and
  the pepper. Changing an address is an entry in the mapping file.
- The `{userId}` in a URL is still a bearer of "who is being addressed", but it is
  meaningless to an outsider and stable across address changes.
- No production data migration (ADR 0008); all test fixtures were moved to the
  UUID layout in place.
