# 19. Chat Groups

Date: 2026-09-27

## Status

Proposed. Implementation plan: `docs/plans/chat-groups.md`. Builds on ADR 0004,
ADR 0009 and ADR 0015.

## Context

Chats are strictly one-to-one today (ADR 0015): a chat Document is owned by the
inviter of a contact request, its key is derived by both parties via
`ECDH(own private, other public) + HKDF`, and the non-owning party reaches it
through a key entry `{issuer = kid = invitee}` filed under the chat Document -
a direct grant (ADR 0009) that gives them the `member` role.

We want **group chats** with any number of members: shared message history,
sharing images into the group, and a per-message display of the sender.

Constraints and product decisions:

- **Only the creator manages the group** (add members, rename). This matches
  ADR 0004 decision 3: only the `owner` may `PUT` a document or file keys on
  it.
- **Only the creator's own contacts can be added.** Members need not be
  contacts of each other.
- **Joining is explicit**, via an invitation that appears in the 1:1 chat
  between creator and new member.
- **Removing members and leaving a group are out of scope** for this ADR. Key
  slots are write-once and the membership cache in `RolesFilter` is never
  invalidated (ADR 0004 decision 1), so both need their own design.
- The server must stay zero-knowledge, and the access graph at rest must stay
  hidden (ADR 0009).

The derived-key approach of ADR 0015 does not carry over: static-static ECDH
yields a secret for a *pair* of key pairs, there is no equivalent for n
parties.

## Decision

### 1. The group is a document owned by its creator

A group is a Document of type `group` in the creator's tree, a child of their
"chats" Document - like a 1:1 chat Document owned by an inviter. Its encrypted
content is

```
{ type: "group", name, owner, members: UserId[], publicProfiles: { UserId -> publicProfileId } }
```

It is created in one atomic `POST /users/{owner}/documents` together with the
updated "chats" list (a new `groups` entry, see decision 5), with a
self-issued key entry wrapped under the "chats" Document's key - exactly like
the chat Document in ADR 0015 leg 3. Its messages live at
`/users/{owner}/documents/{groupId}/messages`.

The creator learns each member's public-profile id from the metadata of the
1:1 chat with that member.

### 2. The group key is random and distributed over existing 1:1 chats

The creator generates a random AES-GCM-256 **group key**; it is the group
Document's own Document key. To add contact `M`, the creator

1. loads the 1:1 chat key shared with `M` (`contactService.loadChatKey`),
2. updates the group metadata (`members`, `publicProfiles`; `PUT` with
   `If-Match`, retried on `412`),
3. files `{ issuer: M, kid: M, sharedKey: wrap(groupKey, pairChatKey) }` under
   the group Document (`POST .../documents/{groupId}/keys`),
4. posts an invitation message into the 1:1 chat with `M`:
   `{ "type": "group-invitation", groupId, owner, name }`.

Step 3 is the existing `documentService.shareDocument` operation with the
group Document as the shared document. The entry is at the same time

- the **transport** of the group key - only the two parties of the 1:1 chat
  can unwrap it, and
- a **direct grant** (`witness(M, M)`, ADR 0009) that makes `M` a `member` of
  the group Document and its messages sub-resource.

No new handshake, no new key exchange and no server-side key sync are needed.
The key is filed before the invitation is sent, so a join never finds it
missing. A `409` on re-filing is swallowed (already added).

### 3. Joining is a client-side step

The invitation message is rendered in the 1:1 chat with a "Join" action.
Joining

1. loads the group Document from the creator's tree with the own key entry
   (`parentId = self`, `parentKey = pairChatKey`), which yields the group key,
2. adds a `GroupEntry { groupId, owner, name, groupKey }` to the own "chats"
   Document (ETag-guarded read-modify-write, like `updateContact`),
3. shares the own public profile into the group (decision 4).

Keeping `groupKey` in the entry means opening the group needs no detour
through the 1:1 chat. It is protected by the "chats" Document's encryption,
like `ContactEntry.pending.chatKey` (ADR 0015 decision 5).

Not joining leaves the key entry in place: an invited contact can technically
read the group even if they never join. This is accepted until removal exists.

### 4. Shares into a group use one key entry and an Access-Path

A document shared into a group - an image in a message, or a member's public
profile - gets **one** key entry in the sharer's tree:

```
{ issuer: groupOwner, kid: groupId, sharedKey: wrap(documentKey, groupKey) }
```

instead of one `{issuer = kid = recipient}` entry per recipient as in 1:1
chats. Readers send an `Access-Path` header

```
{ "chain": [ { doc, owner: sharer, wrappedBy: groupId },
             { doc: groupId, owner: groupOwner, wrappedBy: groupId } ] }
```

(base64url-encoded; every hop carries `wrappedBy`, the terminus hop is
self-referential like the one `buildAccessPath` emits for folder shares)

which `DocumentRepository.verifyAccess` already accepts: the first hop is
linked by the stored witness `(groupOwner, groupId)`, the second terminates in
the caller's direct grant on the group (or the caller owning it). As a result

- sharing costs one key write regardless of the group size,
- members who join later see documents shared before they joined, consistent
  with them seeing the full message history,
- revoking access to shared documents reduces to revoking group membership.

### 5. The "chats" Document lists groups next to contacts

`ChatListMetadata` gains an optional `groups: GroupEntry[]` next to
`contacts`. Being optional, existing "chats" Documents stay valid; per ADR 0008
there is no data migration anyway.

### 6. No server changes

Everything above uses existing endpoints and authorization rules: the group
Document and its messages are reached via a direct grant, shared documents via
an Access-Path, and all writes are `owner` writes into the writer's own tree
(group metadata and key entries by the creator; shares by the sharer; the
"chats" Document by its owner). `MessageService` accepts messages because the
group Document exists. The server cannot tell a group from a 1:1 chat.

### 7. Federation

The group lives on the creator's server; the creator is always a local
account. Members may be guests (ADR 0013) - they only need `member`-scoped
calls: reading the group Document, reading and posting messages, and
Access-Path reads. Documents a federated member shares into the group stay on
that member's server, as for 1:1 chats today.

## Consequences

- Group chats without new server code, new roles, new endpoints or a new
  handshake; the authorization model of ADR 0004/0009 covers them.
- The group key is transported (wrapped under a 1:1 chat key), unlike the
  derived 1:1 chat key. Security is equivalent: anyone able to open the 1:1
  chat can open the group, and neither has forward secrecy.
- Adding a member requires the creator's client to be online; messaging and
  sharing do not.
- A member can only add contacts to a group they own. Other members appear by
  their public profile, or as an unknown member while their profile is not
  shared yet.
- The access graph at rest gains group edges (`{issuer = member}` under the
  group, `{issuer = groupOwner, kid = groupId}` under shared documents); they
  are hidden by the salted witnesses of ADR 0009 like every other edge.
- Invited but not (yet) joined contacts can read the group.
- **Not covered, needs a follow-up ADR:** removing members and leaving. This
  requires deleting key entries (slots are write-once today), invalidating the
  `RolesFilter` membership cache (never invalidated today, ADR 0004), and
  rotating the group key (key epochs, messages tagged with their epoch) so
  removed members cannot read new content. Transferring or deleting a group
  and member admin rights are also left open.
