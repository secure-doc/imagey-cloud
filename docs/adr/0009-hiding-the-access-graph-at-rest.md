# 9. Hiding the Access Graph at Rest

Date: 2026-09-03

## Status

Accepted (Option B), 2026-09-04. Implementation plan:
`docs/plans/hide-access-graph-at-rest.md`. Directory-name hashing (listed under
Option B below) is **deferred** to a later ADR amendment - see the Decision
section.

The Context, threat model, "crux" and the full set of options are kept below as
the analysis that led to the decision.

## Context

Document content and metadata are end-to-end encrypted (ENCRYPTION.md, ADR 0001).
The *authorization* data is not. A `member` decision is computed by walking the
key files on disk (`RolesFilter.isMember` -> `DocumentRepository.isIssuerInKeyChain`):
each wrapped key is `documents/{H(documentId)}/keys/{kid}.json` holding
`{issuer, kid, sharedKey}`, where only `sharedKey` is ciphertext. `issuer` and
`kid` are plaintext, and `kid` is also the file name.

An attacker with read access to the data volume (a stolen disk, a backup
snapshot, a mis-scoped volume mount, a curious operator) can therefore
reconstruct:

- **The folder hierarchy of every user.** The edges `documentId -> kid` name a
  parent document that lives at `documents/{kid}/`, so the whole tree - depth,
  fan-out, document count, and via file mtimes the timeline - is readable.
- **The sharing / contact graph.** A key file in O's tree with `issuer = C`
  (C != O) means "C has access to this document/folder of O". For a chat,
  `documents/{chatId}/keys/{C}.json` in the owner's tree yields the edge
  O <-> C. Enumerated over all chats and shared folders, this is the social
  graph.
- Combined with `user-ids.json` and its pepper (ADR 0007), the graph is
  de-anonymized to email addresses. Even without that, a pseudonymous social
  graph plus activity timing is re-identifiable.

The content is zero-knowledge, but the server authorizes requests by traversing
a plaintext graph, and that traversal is exactly what the filesystem attacker
replicates. Encrypting only the leaves (`sharedKey`, already done) does not help:
as long as the "next hop" of the walk is a deterministic, self-consistent
function of what is on disk, an offline reader follows it too.

This is not currently exploited - there is no production data (ADR 0008) - but it
is a structural weakness in the at-rest story and worth resolving before launch.

## Threat model in scope

- **In scope:** an attacker who can *read* the data volume or a backup of it, but
  does not have the running process's memory and does not hold runtime secrets
  (`user.mapping.secret`, and any secret this ADR might introduce).
- **Also in scope:** the same attacker who *additionally* obtains the runtime
  secret(s). We want the residual leak in that case to be small.
- **Out of scope:** a fully compromised running server, or a malicious operator
  with process memory. Hiding the graph from the server *while it is serving
  requests* would need trusted hardware, PIR/ORAM, or O(n) work per request and
  is not attempted here.

## Constraints

1. The `member` check runs in `RolesFilter` at `@Priority(AUTHENTICATION)`,
   before the resource, for every `GET`/`POST` on `.../documents/...`. It must
   stay off the hot path (today: `membershipCache`, a 10k-entry positive-only
   LRU).
2. Membership is transitive and may cross account trees (a document contributed
   to someone else's shared folder - ADR 0004).
3. `GET .../documents/{id}/keys/{kid}` must still locate one key file directly.
4. Key slots are write-once (ADR 0004 decision 2). No update flow.
5. No production data: a migration is an in-place rewrite of test fixtures
   (ADR 0008).
6. Whatever is stored must let the *server* still answer membership, while
   denying the *offline reader* the graph.

## The crux

The determinism is the leak. `kid` as a file name equals the parent's directory
name `documents/{kid}/`; the same `issuer` repeats in every document a user can
reach. Equal plaintext -> equal on-disk token -> the attacker joins child to
parent and groups siblings, even without knowing any plaintext id.

Two independent levers break this:

- **Randomize** the stored form (a per-record salt or IV), so the same `kid`
  referenced by 50 children yields 50 uncorrelated tokens.
- **Move routing to the client**, so the server only *verifies* a client-asserted
  parent rather than *discovering* it - then the stored form can be a one-way
  witness instead of reversible ciphertext.

A third move sidesteps both: **stop authorizing from the graph at all** - store
membership as a flat salted set and test it by point lookup (Option D).

Options A-C combine the first two levers differently; D takes the third.

## Options considered

### Option A - server keeps the walk, fields encrypted

`keys/{...}.json` still carries `issuer` and `kid`, but as
`AES-GCM(K_enc, randomIV, {issuer, kid})` with a fresh IV per file. `sharedKey`
is unchanged. `isIssuerInKeyChain` is unchanged in logic: it still
`listFiles()` + reads each envelope, with one decrypt step added before it can
compare `issuer` and recurse into `kid`.

- `K_enc` is derived (HKDF, domain-separated label) from a new runtime secret
  `document.mapping.secret`, same policy as ADR 0007 (>= 256 bits, no default,
  server refuses to start without it, back it up like a signing key).
- Directory names (`users/{id}`, `documents/{id}`) become
  `base64url(HMAC(K_name, id))` so the path itself stops naming accounts and
  documents. The server hashes the plaintext id from the URL to resolve the
  path.
- `GET .../keys/{kid}`: file name becomes `HMAC(K_name, documentId || kid)`
  (edge-unique, so no collision with the parent's directory name), resolved in
  O(1) from the URL's plaintext `documentId` + `kid`.

**Attacker without the secret:** random-looking directory names; key files are
`{iv, <blob>, sharedKey}`. No join, no sibling grouping.

**Attacker with the secret:** can decrypt every envelope and rebuild the full
graph - same as today. The secret is a single point of failure.

**Cost:** smallest change. `RolesFilter`, the cache, the cross-tree recursion,
the `visited` set, and the `kid == issuer` stop condition (M9) all stay.
Client and API are almost untouched (the `keys` response can still carry
`issuer`/`kid` - it is TLS, not disk).

### Option B - hashed issuer/kid, client asserts the chain for transitive access

**Store, don't encrypt.** Each key file becomes `{ salt, witness, sharedKey }`
with `witness = HMAC(pepper, salt, issuer || kid)` - one keyed, salted hash of
the two fields together. The server never needs to *recover* `issuer` / `kid`
(the client always has them), so a one-way witness is enough; nothing reversible
is stored. `pepper` = a new runtime secret `document.mapping.secret` (policy per
ADR 0007); `salt` is generated by the server on write. (Option A additionally
hashes the on-disk directory names; for B that is **deferred** - see the
Decision section.)

`salt` granularity is a sub-choice: **per document** (one salt for the whole
`keys/` folder) already makes folder `F` referenced by 50 children hash 50
different ways, so no sibling correlation across documents. **Per file** also
hides repeated issuer/kid *within* one document's `keys/` folder - marginally
stronger, not required.

**Base-case entries are self-referential.** A direct grant always has
`issuer == kid == grantee` (folder / chat share: `DocumentService.shareDocument`
files `issuer: contactUserId, kid: contactUserId`; the server-synced chat key
the same - this is what M9 works around). So the server can test the base case
with **no client input**: compute `HMAC(pepper, salt_D, caller || caller)` and
look for it among `D`'s key files.

**The chain header is only needed for transitive access** - a document that sits
*inside* a shared folder or subfolder. Direct shares, chat-document entries, and
the caller's own content resolve by the base-case scan alone.

```
Access-Path: <base64url(JSON)>        # only when the base-case scan misses
```

```json
{
  "chain": [
    { "doc": "<D>", "owner": "<O>", "wrappedBy": "<F>" },
    { "doc": "<F>", "owner": "<O>", "wrappedBy": "<G>" }
  ]
}
```

The `member` check (`isIssuerInKeyChain` -> `verifyChain`):

1. Base-case scan on `chain[0].doc` (or the URL's document when no header): a key
   file whose `witness == HMAC(pepper, salt, caller || caller)` -> member, done.
2. Otherwise, for each adjacent pair, a key file exists under
   `documents/{H(chain[i].doc)}/keys/` in `chain[i].owner`'s tree whose
   `witness == HMAC(pepper, salt, chain[i+1].owner || chain[i+1].doc)`
   (the hop's key is wrapped by `chain[i+1]`), and
   `chain[i].wrappedBy == chain[i+1].doc`.
3. Terminate when a hop's document yields a base-case hit for the caller
   (its own root/settings document, a shared folder's grant, or an individual
   chat document's entry). No hit by the end of the chain -> 403.
4. On success, cache `(owner, url-document, principal) -> true` as today.

The `keys` response shrinks to `{ sharedKey }` (the client knows `kid` - it sent
it - and already tracks the owner as `DocumentMetadata.owner`). Key-file names
can be random, or the edge-unique `HMAC(pepper, documentId || kid)` from Option A
for O(1) `GET .../keys/{kid}` lookup.

**Attacker without the secret:** `documents/{H(id)}/keys/{...}.json` ->
`{salt, <blob>, <blob>}`. Salt kills correlation; no plaintext to recover.

**Attacker with the secret:** can only *test guesses* -
`HMAC(pepper, salt_i, guess)` against each file - and the guesses are 122-bit
random UUIDs. Nothing recoverable, nothing enumerable. Strictly better than
Option A's "secret leak = full graph".

**Forgery:** a caller must supply, for every hop, plaintext ids that hash to the
stored witnesses and form a connected path terminating in a base-case hit for
itself. HMAC preimage resistance + UUID entropy makes that infeasible, and a
caller only knows the ids inside a subtree it can actually decrypt - i.e. is a
member of. Self-enforcing.

**Bonus:** revocation works - delete the grant entry and the base-case hit (and
thus the chain terminus) is gone. The "never invalidate the cache" caveat
(ADR 0004) and the `kid == issuer` hack (M9) both disappear - no fuzzy recursion
left.

**Cost:** larger change. Transitive-access requests carry the chain header
(~90 B/hop base64; realistically 1-4 hops, cap at e.g. 32). `verifyChain`, the
`Access-Path` builder on the client, the `keys` response shape, the
`documentExists` checks in `DocumentService.uploadDocument`, and the multipart
upload's key part all change. Client hierarchy code must have the ancestor chain
available at request time (it does, having walked down from the root -
ENCRYPTION.md section 4). The `Authorization` header is free today (auth is the
`token` cookie), but a dedicated header reads better - the chain is a proof hint,
not a credential.

### Option C - central encrypted adjacency index

Edges move out of the per-document key files into one structure -
`membership` log, rows `AES-GCM(pepper, {docId, memberId, parentDocId})` -
loaded into an in-memory adjacency map at startup. The filesystem layout carries
no edges at all; key files hold only `sharedKey`.

Security-equivalent to Option A (reversible, pepper is a single point of
failure), but adds a second source of truth to keep consistent with the key
files and a hydration step on boot. Only worth it if the `member` check becomes
far hotter than today. **Currently not favoured.**

### Option D - reframe membership as grants, not reachability

Options A-C all keep ADR 0004's premise: `member` == reachable in the
key-wrapping graph, so the server authorizes from the same structure that
distributes keys. Option D breaks that link. Authorization becomes a flat,
salted **grant set**; the key-wrapping graph stays, but only for key
distribution - the server never reads its shape.

```
isMember(C, D)  ->  exists( grants/{H(pepper, salt, C || D)} )   // file: {salt, mac}
```

A single point lookup. The server has `C` (from auth) and `D` (from the URL) in
the clear; that is all it needs. No walk, no chain header, no recursion, no
`visited` set, no M9 stop condition, no cache-invalidation caveat (a grant
delete is local and cheap). `issuer` / `kid` inside key files become pure
client hints and can be dropped or fully encrypted.

Grants are **materialized** by the granting client:

- direct share of D with C -> 1 row
- share folder F (K documents) with C -> K rows
- member C adds a document to shared folder F (M members) -> M rows

This reverses the ADR 0004 benefit ("grant a folder and everything inside it
follows"). For a photo app with thousands of images per folder, sharing a folder
is thousands of grant writes.

A spectrum sits under "grants":

| flavour | check | writes on share | request hint |
|---|---|---|---|
| flat grants `(C, D)` | 1 lookup | O(folder size) | none |
| folder-granular grants `(C, F)` + one asserted hop `D -> F` | 2 lookups | O(1) per nesting level | one parent id |
| session token (Bloom filter of reachable docs, verified once at login) | token check, 0 disk hits | - | session token |
| drop read authz entirely - unauthorized ciphertext / keys are useless; keep `owner` for writes + an optional anti-enumeration check | trivial / none | - | - |

The **folder-granular** flavour is the likely sweet spot: one grant per folder
per nesting level (few writes), a one-id hint instead of a full chain, an
O(1)-ish check, graph still hidden. Cheap for shallow sharing trees (1-2
levels). The **session token** is orthogonal and composes with any storage
model: the expensive verification runs once per session, not per request.

**Revocation:** delete the `(C, *)` grant rows for the affected subtree. Finding
them needs either a `grantsByPrincipal/{H(pepper, C)}/...` index (leaks a
per-user *count* of authorizations, not which) or a separate encrypted index.

**Attacker at rest:** `grants/` is a directory of opaque salted tokens - no
principal, no document, no correlation between two rows. Graph gone, with no
per-request chain and no runtime-decryptable field. Only total grant count and
mtimes leak.

**Unlike A/B/C, Option D does not amend ADR 0004 - it replaces it**, and it
touches ADR 0002/0003 (the client owns the hierarchy outright).

## Comparison

| | A: encrypted fields | B: asserted chain | C: central index | D: grant set |
|---|---|---|---|---|
| Server still traverses autonomously | yes | no (verifies) | yes | no (point lookup) |
| Secret leak + disk leak | full graph recoverable | guess-testing only (UUIDs -> nothing) | full graph recoverable | guess-testing only |
| Needs a runtime secret | yes | yes (or rely on UUID entropy alone) | yes | yes (or UUID entropy alone) |
| Reversible plaintext on disk | yes (in memory of server) | no | yes | no |
| Request/API change | minimal | moderate (chain header on transitive reads only, responses, upload) | minimal | small (grant writes on share; maybe a one-id hint) |
| Client change | none | moderate (build the chain for transitive reads) | none | moderate (materialize grants) |
| Write amplification on share | none | none | none | O(folder size), or O(1)/level folder-granular |
| Fixes revocation / removes M9 & cache caveat | no | yes | no | yes |
| Extra I/O on the walk | one decrypt per key file | none (existence checks) | none (in-memory) | none (one stat) |
| New consistency burden | none | none | index vs. key files | grants vs. key files |
| Relation to ADR 0004 | amends | amends | amends | replaces |

## Decision

**Option B**, with a pepper (`document.mapping.secret`, policy per ADR 0007) and
in the sharpened form worked out below the option: a per-key-file
`witness = HMAC(K_witness, salt, issuer || kid)`, an edge-unique key-file name
`HMAC(K_name, documentId || kid)`, and a `member` check that is a **direct-grant
scan** first (base-case entries are self-referential `issuer == kid == grantee`,
so this needs no client input) and only falls back to a client-supplied
`Access-Path` chain for genuinely transitive access (a document inside a
contact's shared folder). Chats resolve by the direct-grant scan alone.

Rationale over the alternatives:

- Over **A / C**: a secret leak combined with a disk leak only enables
  guess-testing 122-bit UUIDs, not recovery of the whole graph. B also fixes
  revocation and removes the M9 hack and the "never invalidate the cache"
  caveat, because the fuzzy recursion is gone.
- Over **D**: no write amplification on folder share, and ADR 0004's
  "grant a folder and everything inside it follows" is preserved. D's clean
  re-cut is attractive but its cost (O(folder size) grant writes, a new
  consistency burden, superseding ADR 0004 and touching ADR 0002/0003) is not
  justified by the marginal security difference over B.

**Deferred:** hashing the on-disk directory names (`users/{id}`,
`documents/{id}`). Those ids are already random UUIDs; the structural join that
leaks is via the key-file *name*, which B fixes. Hiding the *set* of userIds is
`user-ids.json`'s concern (ADR 0007). Directory-name hashing touches every
repository, `AuthenticationFilter`, `ChallengeService`, the `user-ids` handling
and every fixture directory for little additional protection - it gets its own
ADR amendment and plan if pursued.

## Resolved questions

Settled 2026-09-04 (details and rationale in the implementation plan):

1. **Which option:** B.
2. **Pepper:** kept - `document.mapping.secret`, policy per ADR 0007, HKDF to
   `K_name` / `K_witness`.
3. **Chain depth cap:** `MAX_CHAIN_HOPS = 32`; malformed / oversize / too deep
   -> 400, a well-formed chain with no direct-grant terminus -> 403.
4. **Cross-tree hop:** each chain element carries its own `owner`; the verifier
   switches trees on it. The M9 `kid == issuer` stop condition is deleted with
   the recursion.
5. **`sharedKey` blob length** (ECDH- vs symmetric-wrapped): noted, not padded in
   this change - it distinguishes share *type*, not the graph. Revisit if the
   type distinction is judged sensitive.
6. **`membershipCache` key** stays `(owner, documentId, principal)`; no
   plaintext-id-derived value needed.
7. **Directory-name hashing:** deferred (see Decision). ADR 0006 artefacts
   (`user-ids.lock`, `user-ids.json`) are outside the per-user tree and
   unaffected either way.
8. **ADR 0002/0003/0004:** B amends ADR 0004 (`isIssuerInKeyChain` recursion
   replaced by a direct-grant scan + client-asserted chain); it does not
   supersede 0004 and leaves 0002/0003 as they are.
9. **Cache invalidation for revocation:** deferred - no key-delete endpoint
   exists; the positive-only, never-invalidated cache and its ADR 0004 caveat
   stay.

## Consequences (conditional, once decided)

- **A or C:** a new critical runtime secret `document.mapping.secret`. If it
  leaks together with the disk, the entire access graph is recoverable - the
  residual risk is the same class as ADR 0007's "pepper + file". **B and D** also
  take that secret (or lean on 122-bit id entropy instead), but a secret leak
  there only enables guess-testing, not recovery.
- **B:** the server can no longer compute membership on its own; a request
  without a valid `Access-Path` (where required) is denied. Clients and
  any future non-browser API consumer must build the chain. In exchange,
  `verifyChain` is simpler than `isIssuerInKeyChain`, revocation becomes a file
  delete, and M9 plus the cache-invalidation caveat disappear.
- **D:** ADR 0004 is superseded. `isIssuerInKeyChain` and the key-chain recursion
  are deleted; the `member` check is a `grants/` stat. The granting client gains
  a materialization step (and its failure modes - a partially written grant set
  on a large folder share needs the same idempotent-retry treatment as the
  two-tree upload write). `issuer` / `kid` leave the server's authorization path
  entirely.
- **All options:** directory names become opaque hashes; operational tooling that
  inspects `root.path` by hand needs the server (or a helper) to resolve ids.
- **Migration:** in-place fixture rewrite (ADR 0008). A-C: re-encrypt or re-MAC
  every `keys/*.json` and rename the `users/` and `documents/` directories. D:
  additionally derive the initial `grants/` set from the existing key chains
  (a one-off full walk of the current fixtures). Secret rotation later means the
  rewrite again.
- **ENCRYPTION.md sections 3-5** and the glossary need updating to describe the
  chosen at-rest representation.
