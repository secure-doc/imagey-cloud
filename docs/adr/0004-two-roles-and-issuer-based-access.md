# 4. Two Roles and Issuer-Based Document Access

Date: 2026-08-29

## Status

Accepted

## Context

Authorization was computed per request from four ad-hoc roles in
`RolesFilter`: `owner`, `recipient` (a key file existed at
`documents/{id}/keys/{callerEmail}/`), `contact` and `contact-request` (an
`ACCEPTED` / `INVITED` `ContactExchange` existed). This was redundant, tied
access to an email-as-`kid` convention, and did not express the folder
hierarchy the key structure already encodes (ADR 0002/0003).

## Decision

1. **Two roles only.** `owner` = the account in the `{email}` path segment.
   A `member` of a document is any account that has *issued* one of its
   keys, or - recursively - can reach the parent document (folder / chat) a
   key wraps under. The parent lives in that key's `issuer`'s tree, so the
   walk may cross account trees (a document contributed to someone else's
   shared folder). It is bounded by a visited-set of `(owner, id)` pairs.
   Only positive results are cached, in a bounded JDK LRU (`BoundedLruCache`)
   in `RolesFilter`, and never invalidated: key slots are write-once (see
   decision 2), so a key add can only *grant* a path - the next request
   picks it up - and no current operation can take one away. A future
   key/document deletion would break that and need the cache cleared.

2. **Persist the key issuer.** A shared key is one JSON file
   `documents/{id}/keys/{kid}.json` (the serialized `EncryptedSharedKey`,
   `{issuer, kid, sharedKey}`), replacing the former raw-bytes
   `keys/{kid}/encrypted-shared.key`. All three fields are mandatory
   (`EncryptedSharedKey` rejects a null component). A slot is **write-once**:
   every use case (registration, document upload, sharing a document into a
   chat, the chat-key sync) files a fresh `{kid}`; there is no update flow,
   so writing onto an occupied slot with different content is a `409`
   (identical content is an idempotent no-op).

3. **Members may add, not modify.** `member` grants every `GET` and posting
   chat messages. `POST /users/{caller}/documents` always targets the
   caller's own tree (so it needs only `owner`); `metadata.folderOwner`
   names the folder's tree, the new document lands in the caller's, and the
   folder-content update in the folder owner's (a non-transactional
   two-tree write). Being a member of that folder is enforced in
   `DocumentService`. Filing a shared key is `POST .../documents/{id}/keys`
   (create-only, `owner`; the `kid` comes from the body, fetched back via
   `GET .../keys/{kid}`); all `PUT` (content updates) stays `owner`-only.

4. **Chat access via server-side key sync.** A chat is always reached
   through its owner's namespace (`Contact.owner`). The non-owning party's
   key entry - the chat key re-wrapped under their own "chats" document key,
   issuer = themselves - is delivered in the receipt-confirmation request
   and filed by the server under the chat document in the owner's tree.
   That entry is what grants them the `member` role; no ECDH is needed to
   open a chat.

5. **`public-keys/{kid}` is owner-only.** The inviter's public key travels
   in the invite link / contact request instead of being fetched.

## Consequences

- One coherent access rule that mirrors the encryption hierarchy: grant a
  folder (or chat) and every document inside it follows.
- The membership walk touches the filesystem; the LRU cache keeps it off
  the hot path for repeated access to the same document.
- `issuer` on a shared-document key envelope now denotes the grantee, not
  the document owner; the client tracks the owner separately
  (`DocumentMetadata.owner`, stamped by `loadDocument`).
- No production data exists yet, so test fixtures were migrated in place
  rather than with a data migration.
