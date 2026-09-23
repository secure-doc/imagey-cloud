# 13. Cross-Server Sharing via Client-Mediated Federation

Date: 2026-09-15

## Status

Proposed - not yet implemented. Written up from a design discussion; no code
exists for any part of this ADR.

## Context

`imagey.cloud` and `secure-doc.store` (and their `.cloud`/`www` variants) are
today two brand names in front of **one** backend deployment: both domains
resolve to the same server process, the same `root.path`, the same
`user-ids.json`, and the same `user.mapping.secret` (see
`secure-doc.urls`/`imagey.urls` in
`imagey-server/src/main/resources/META-INF/microprofile-config.properties`).
There is no real server boundary yet, so nothing described below exists.

The question this ADR answers: if `secure-doc.store` (or any third party
running compatible software) were a genuinely independent deployment - its
own storage root, its own `user.mapping.secret`/`document.mapping.secret`,
its own `UserId` space, its own operator - how would a user on one instance
share a contact, a chat, or a document/folder with a user on the other?

Two things make this tractable rather than a ground-up redesign:

- **The end-to-end encryption is already server-agnostic.** A document/folder
  key is wrapped asymmetrically against a recipient's `PublicKey`
  (`Main Key Pair`, ENCRYPTION.md); wrapping does not care which server
  storage the recipient's account lives in.
- **Authorization is already decoupled from account existence.**
  `RolesFilter.hasRole`/`isMember`
  (`imagey-server/src/main/java/cloud/imagey/application/authentication/RolesFilter.java`)
  tests only whether the `UserId` in the session token's `sub` claim has a
  matching grant/witness entry (`DocumentRepository.verifyAccess`, ADR 0009).
  It never checks that the `UserId` belongs to a locally-registered,
  locally-authenticatable account. `AuthenticationFilter` is the *only* place
  that ties a token to a real account
  (`userMappingService.findUserId` + `userRepository.exists`, see
  `imagey-server/src/main/java/cloud/imagey/application/authentication/AuthenticationFilter.java`).

That narrows the whole problem to one question: **how does a foreign user
obtain a valid `AUTHENTICATION`-type token for a `UserId` recognized on the
other server, without going through that server's own email-challenge
login?** Everything downstream - `RolesFilter`, the witness/Access-Path scan
(ADR 0009), `DocumentService`, the `ContactExchange` state machine
(ADR 0004) - needs no change once that token exists.

## Options considered

### Option 1 - server-to-server federation (Matrix/ActivityPub-style)

Servers call each other's APIs directly and vouch for their own users on
every request. Delivery is truly instant regardless of whether either
client is online, because the always-on server process is the delivery
agent.

Rejected for now: it requires a bilateral trust relationship between
operators (discovery, mutual authentication, allow-listing), and it means
`RolesFilter`'s trust boundary has to accept identity claims asserted by an
arbitrary partner server on every request - a materially larger attack
surface than this project's current single-operator, self-hosted-leaning
threat model (ADR 0009's threat model explicitly excludes a compromised
running server) is built for.

### Option 2 - client-mediated bridge with signed identity assertions (chosen)

No server-to-server data-plane traffic at all. A user's own client carries
signed, narrowly-scoped assertions between the two servers - the same shape
as the existing invite-link/token pattern
(`ContactService.invite`/`acceptInvitation`) already uses within one server.
Each server independently decides, per assertion, whether to trust it, by
verifying a signature against a key the *issuing* server publishes at a
well-known URL - the same trust primitive TLS/DKIM/OIDC discovery already
rely on ("I trust what this domain serves over HTTPS"), not a registered
partnership between operators.

Trade-off, discussed in depth before writing this ADR: this buys no true
real-time push. Delivery only happens when a client holding the right
credentials for *both* sides happens to be connected at the right moment.
Today's single-instance system already only offers *poll-bounded* realtime
(no WebSocket/SSE exists anywhere in the codebase; `messageHooks.ts` and
`ContactService.ts` poll) - but within one server, data is written straight
into the recipient's own tree the instant it is sent, so it is simply
sitting there, unpolled, until they connect. Across two independent
servers there is no "recipient's tree" on the sending side to sit in;
nothing moves until a client relays it. The existing invitation e-mail
(`ContactService.invite`) is exactly the right pattern to paper over this:
it is an out-of-band nudge, and the actual transfer happens lazily, next
time a client with a live bridge connects. Acceptable for contacts/document
sharing; a materially worse experience than today's chat if reused
unmodified for chat message delivery.

## Decision

Adopt Option 2. Concretely:

### 1. Federation signing key + discovery

Each server generates its own signing keypair, independent of
`user.mapping.secret`/`document.mapping.secret`, and publishes the public
half at `GET /.well-known/imagey-federation-key`. A verifying server fetches
and caches a partner domain's key the first time it sees an assertion with
that `iss`; this is the one place Option 2 still makes an outbound call to
the partner domain, but it is a rare, cacheable, one-directional read of a
public document - not a stateful integration, and not something a client can
substitute (a client-supplied key would let a malicious inviter impersonate
any domain).

**Rotation and compromise.** Unlike the peppers (Glossary: "no default - the
server refuses to start without it, back it up"), losing this private key
is not catastrophic - it protects nothing at rest, only signs assertions
that already expire within ~60s. Losing it, or simply rotating on a
schedule, just means: generate a new keypair, publish it, done. Because
assertions are short-lived and never persisted, routine rotation needs no
JWKS-style key-ID/overlap scheme - nothing is ever in flight long enough to
outlive a key change. The only real interaction with rotation is the
verifier's cache, bounded by three knobs, no new protocol:

- **Publisher-set `Cache-Control: max-age`** on the `.well-known` response
  (default on the order of an hour); an operator can shorten it during an
  incident.
- **Verifier-enforced ceiling** on the TTL it honours regardless of what the
  publisher sends - the actual security property (a bounded exposure
  window after compromise) must not depend on the remote party being
  correctly configured.
- **Refetch-on-verification-failure**, at most once per `(domain,
  cached-key)` per a short cooldown (~1 minute) - picks up an
  unannounced/urgent rotation quickly, without reopening the
  domain-cycling cache-bypass problem decision 5 defends against (a
  garbage-signature probe is throttled the same way an unseen-domain probe
  is).

**Compromise's actual blast radius** is narrower than "any user of the
compromised server can be impersonated everywhere": decision 2's check
(assertion `sub` must match the invitation token's subject) still gates a
*first-time* invitation redemption on possessing that separately-issued,
mailed token - a stolen key alone cannot forge a fresh contact. What it
does buy an attacker is minting sessions for `ForeignUserMapping` entries
that **already exist** - impersonating an already-linked foreign contact to
read whatever was already shared with them, bounded by the cache/refetch
window above. Detecting the compromise itself (secret storage, monitoring)
is operator hygiene, out of scope here, same as for the existing peppers.

### 2. The recipient declares their home server, at accept time

The invite step needs no change at all. O invites `bob@gmail.com` exactly
as today; O's client never learns of, or has to guess, a target domain.
`ContactService.invite` mints its usual local placeholder `UserId` for the
recipient, persists the `ContactExchange(INVITED)`, and sends the existing
invitation e-mail with a link to A's own invitation page
(`https://imagey.cloud/invitations/{token}`) - e-mail is already the
universal, domain-agnostic way to reach bob regardless of which
imagey-compatible server he eventually turns out to use, so no discovery
mechanism is needed on the sending side.

The domain question surfaces only where the answer is actually known: when
bob opens the link. A's invitation page offers a second path alongside
"register here" - "I already have an account elsewhere" - and bob names his
home server (B). Proving that identity back to A, without relying on
fragile cross-origin cookies, is a redirect dance in the shape of an OAuth
authorization flow, every hop same-origin:

1. Bob, on A's page, picks B. A redirects to
   `https://secure-doc.store/federated-confirm?returnTo=https://imagey.cloud/invitations/{token}`.
2. Bob authenticates to B normally (same-origin, his regular session). B
   shows "confirm accepting an invitation from arne@imagey.cloud?".
3. On confirm, B mints a short-lived (~60s), single-use, audience-locked
   assertion and appends it to the redirect back to `returnTo`, in the URL
   **fragment** (never sent to any server, forwarded by client-side JS
   only):

   ```json
   {
     "iss": "secure-doc.store",
     "sub": "bob@gmail.com",
     "aud": "imagey.cloud",
     "exp": "<now + 60s>",
     "jti": "<nonce>"
   }
   ```
4. A's invitation page reads the assertion from the fragment and redeems it
   (see decision 4 below) - same-origin call to A.

**Security check that makes the rebind (decision 3) safe:** the invitation
`token` from the e-mail link is itself a JWT whose subject is the invited
address (`tokenService.generateInvitationToken(recipient, ONE_WEEK)`,
mirroring how `AuthenticationFilter` reads it). A only honours the redeemed
assertion if `assertion.sub` equals that address. The invitation token
remains, exactly as today, the sole bearer secret that authorizes accepting
- federation adds no new way to hijack a pending invite, and possession of
a valid federated assertion for some *other* address is not sufficient on
its own. A direct consequence: bob can only redeem federated if his account
on B is registered under the exact address O invited; a different address
on B falls back to registering locally under the invited address, same as
today.

### 3. Foreign principal, not a real account

The one new piece of state: `ForeignUserMapping`, mirroring
`UserMappingService` but keyed by `(domain, address)` instead of
`HMAC(email)`. It mints a stable local `UserId` for a foreign principal
(`bob@gmail.com` as vouched for by `secure-doc.store`) the first time A
needs to name one - in a `ContactExchange.inviter`/`invitee` slot, a key's
`issuer`, or a session token's `sub`. Crucially, **no home tree, root
folder, or Settings document is ever created for this `UserId`** - it is a
label the witness scan and `ContactExchange` machinery can reference, never
something `hasRole("owner", ...)` can meaningfully grant, since there is
nothing at that path for it to own.

The local placeholder `UserId` that `ContactService.invite` eagerly minted
at invite time (decision 2) is superseded, not reused: `ContactExchange`'s
`invitee` is rewritten to the `ForeignUserMapping` id (a plain
`contactRepository.persist` of the updated record, same as every other
state transition - no write-once constraint applies to `ContactExchange`
itself, only to key slots, ADR 0004 decision 2). Any tree already created
for the placeholder is simply orphaned.

This is deliberately not treated as a new problem needing a new mechanism:
an invitation that is never accepted *at all* already leaves the same kind
of orphaned placeholder today, and there is no cleanup for it (no
`@Scheduled` job, no account-deletion endpoint, anywhere in the codebase -
`UserMappingService` entries are permanent once minted, by the same logic).
A `ForeignUserMapping` entry is exactly analogous and equally permanent.
Federation does not regress anything here; it just adds one more way to
reach a leftover-state shape the system already accepts. If a general
reaper for unaccepted invitations / stale mappings is ever justified, it
should sweep the local and federated cases uniformly - nothing here needs a
federation-specific mechanism.

### 4. Federated session exchange (mirrors `AuthenticationFilter`)

One endpoint on A, parallel to `/authentications/{token}`, redeems a
B-signed assertion instead of decoding one of A's own magic-link tokens. It
verifies the signature against B's published key (decision 1), then:

- **First redemption (accepting an invitation):** the request also carries
  the invitation `token` from decision 2. A checks `assertion.sub` against
  the token's subject (the security check above), resolves/mints the
  `ForeignUserMapping` entry, and rebinds the pending `ContactExchange`
  (decision 3).
- **Later requests (using access already granted):** no invitation token
  involved - the `(domain, address)` pair already resolves to a stable
  `ForeignUserMapping` entry from the first redemption, so this step is a
  pure lookup.

Either way, the endpoint finishes by calling the existing
`tokenService.generateAuthenticationToken(user, ...)` for the resolved
`UserId` - with a shorter TTL than the local `ONE_HOUR` (see below). From
that point the guest is indistinguishable from a local session as far as
`RolesFilter` is concerned, and the accept call itself is just the
ordinary, unmodified `PUT {userId}/contact-requests/{contact}`
(`ContactResource.updateContactRequest` -> `ContactService.acceptInvitation`),
now authenticated as the freshly-resolved foreign `UserId`.

**Guest token TTL.** Reusing `ONE_HOUR` verbatim undersells one real
difference: this token travels as an `Authorization: Bearer` header
(decision 6), not an `HttpOnly` cookie, since it must survive being
attached cross-origin - it has to sit somewhere JavaScript can read it,
a materially larger exposure surface to XSS-class theft than a cookie a
script can never read. That is the actual argument for a shorter guest
TTL - not "A doesn't control the principal": once A has honestly verified
an assertion, the resulting token is exactly as trustworthy as a local one
for as long as it lives, and a compromised signing key is already bounded
independently (decision 1). It also does *not* help with the separate,
already-flagged `membershipCache` staleness (ADR 0004/0009) - that cache is
keyed by `(owner, document, UserId)`, not by session token, so a shorter
TTL forces a fresh *login*, not a fresh *membership check*.

Given the real risk is bearer-token theft, and renewal is cheap - the
client silently re-mints an assertion from B (a same-origin,
no-interaction call as long as the guest's B session is alive) and
redeems it at A in the background, no visible re-auth - a short,
silently-renewed TTL (on the order of 15 minutes) is the better default
for guest tokens than reusing `ONE_HOUR`.

Guests never reach any endpoint requiring `owner`, and are limited by scope
to what a `member` already needs: reading documents/keys within a granted
subtree (with an `Access-Path` header for nested content, same as any
member, ADR 0009), posting chat messages in a chat they are party to, and
the specific key-filing calls that complete the ECDH/chat-key-sync
handshake (`POST .../documents/{id}/keys`, the chat-key-sync `PUT`).

### 5. Abuse protection for the session-exchange endpoint

This is the one endpoint in the whole design that is reachable without any
prior authentication, and the `.well-known` key fetch it triggers (decision
1) is, structurally, a request to a URL an unauthenticated caller controls
(via `iss`) - the same category of risk as OIDC dynamic issuer discovery or
webhook-URL validation, and it needs the same class of mitigation:

- **Replay:** reject a reused `jti`. The replay cache only needs to cover
  the assertion's own ~60s `exp` window, so it is small and self-evicting -
  no long-lived state.
- **SSRF-hardened key fetch:** `https://` only, on the literal `iss`
  domain; resolve DNS and refuse to connect if the target IP is
  private/loopback/link-local; a short connect/read timeout and a small
  response-size cap (a public key is tiny); run off a bounded
  connection/thread pool so one hanging peer cannot exhaust A's workers.
- **Cache both outcomes.** A resolved key is cached per decision 1's
  rotation/compromise handling. A failed or unreachable lookup is *also*
  cached, briefly (seconds, not hours) - this is what makes domain-cycling
  (attacker rotates through many fake `iss` values) expensive to sustain
  rather than free.
- **Rate limiting:** an ordinary per-source-IP limit on the endpoint, plus a
  separate, tighter limit on *distinct never-seen `iss` values attempted
  per time window* (tracked globally, not per IP) - specifically to blunt
  domain-cycling against the negative-cache defense above.
- **Uniform failure shape.** Invalid signature, unknown domain, expired
  assertion, subject/invitation-token mismatch, and a non-existent
  invitation token should all fail with the same status and comparable
  timing, so the endpoint cannot be used as an oracle to probe which
  invitation tokens exist or are still pending.

None of this needs bespoke new infrastructure - it is the standard shape of
"validate before you fetch a URL supplied indirectly by an untrusted
party." The remaining open point is where exactly this lives operationally
(reused rate-limiting middleware vs. something specific to this endpoint) -
left to the implementation plan.

### 6. Two small changes to existing filters

- **Bearer fallback.** `RolesFilter.filter` currently reads only the
  `token` cookie. Cross-origin guest requests need an
  `Authorization: Bearer <token>` path added alongside it, since third-party
  cookies are unreliable across browsers (Safari ITP, Chrome's phase-out).
- **Scoped CORS**, detailed enough to matter once chat polling is in the
  picture (`messageHooks.ts`/`ContactService.ts` poll on an interval - a
  cross-origin chat means every tick is a cross-origin request):
  - Applies **only** to the `member`-reachable, Bearer-authenticated
    endpoints (documents/keys/chat messages) - never to `owner`-only
    routes, and never to the cookie-authenticated local session at all.
  - On those endpoints specifically, `Access-Control-Allow-Origin: *` with
    no `Allow-Credentials` is the right choice, not a shortcut: since the
    guest token is a bearer credential the caller must already possess and
    attach explicitly (unlike a cookie, it carries no ambient authority),
    an open origin policy adds no CSRF-style risk, and restricting it to a
    fixed set of known frontend origins would reintroduce exactly the
    pairwise-registration burden Option 2 was chosen to avoid.
  - A generous `Access-Control-Max-Age` on the preflight response (up to
    the browser's cap, ~2h in Chromium) - without it, the
    `Authorization` header makes every single poll tick a preflight *plus*
    the actual request, doubling federated chat traffic indefinitely.
  - An explicit, unauthenticated `OPTIONS` responder on these routes -
    preflight requests never carry the `Authorization` header, so it can't
    be handled by the same auth-guarded resource method.
  - The client issues these cross-origin calls with `credentials: 'omit'`
    (cookies would not apply cross-site anyway, and a wildcard origin is
    only permitted without `credentials: 'include'`).
  - A 401 mid-poll (expired guest token) triggers the silent renewal from
    decision 4 and the poll tick simply retries - no new machinery, just
    wiring the existing renewal into the polling loop's error handling.

### 7. Chat has two homes: the exchange's, and the invitee's

`ContactExchange` bookkeeping (INVITED/ACCEPTED/RECEIVED, the public keys)
permanently lives wherever `ContactService.invite` first filed it - on A,
regardless of where either party's real account ends up. The chat
*document*, per ADR 0004 decision 4, is created by the invitee as part of
accepting - and a `ForeignUserMapping` principal has no home tree to create
it in (decision 3). So for a federated pair the chat document can only be
created for real on the invitee's actual home server. If bob is the
invitee, the chat lives on B; O interacts with it as a guest there, using
exactly decisions 1/4/5/6, just with the roles reversed from how they
looked during the invitation itself (there, bob was the guest on A). Which
side ends up hosting a given chat is decided once, by who happened to be
the invitee - not by who initiated contact, and it is symmetric: if bob had
invited O instead, the chat would live on A and bob would be the guest.

**New requirement this surfaces: domain-qualified document references.**
`ContactExchange.chatId` and `publicProfileId` are plain `DocumentId`s
today, implicitly resolved in whichever tree the reader already expects. As
soon as the document they name can live on a different server than the
`ContactExchange` record naming it, that assumption breaks - a client
reading the exchange on A has no way to know it must talk to B instead. Both
fields need a domain component (default: the local server, for
backward-compatible non-federated exchanges); the client-side notion of
"where a document lives" (`DocumentMetadata.owner`, ADR 0004 consequences)
needs the same addition, so it knows which origin and which credential type
(local cookie vs. federated guest bearer) to use for a given document.

**Creation, step by step:** bob's client, holding a guest session on A
(decision 4), reads the pending exchange (`GET .../contact-requests`) to
get O's public key - unchanged, already how the local flow works. It then
creates the chat document for real on B (an ordinary local write, bob is
not a guest on his own server), generates the chat key, wraps a copy for O,
and sends the (now domain-qualified) `chatId` plus the wrapped key back to
A as the ACCEPTED update - same endpoint, same shape, one new field.

**Closing the handshake is a two-step client action, not one.**
`ContactService.confirmReceipt` today does two things in one local
transaction: record the RECEIVED status, and file O's re-wrapped chat key
under the chat document (`documentRepository.create(invitee, chatId, ...)`).
Once the chat document lives on B, A's copy of `documentRepository` simply
cannot reach it - the two things have to happen against two different
servers:

1. O's client tells A "RECEIVED" (bookkeeping only, local session,
   unchanged endpoint) - A recognizes the domain-qualified `chatId` isn't
   local and skips the key-filing step it can no longer do itself.
2. O's client separately files the re-wrapped key directly on B, as a
   guest: `POST {bob}/documents/{chatId}/keys`, the same call already
   scoped into a guest's allowed actions in decision 4. This is the first
   time O touches B at all, so B must resolve/mint its *own*
   `ForeignUserMapping` entry for O first (decision 3's mechanism, run by
   B instead of A - fully symmetric, no special-casing).

**Ongoing messages** are unaffected by any of this beyond decision 6's CORS
detail: `messageHooks.ts` keeps polling and posting exactly as today, just
against B's origin with a federated bearer session for O, silently renewed.

**Sharing an image in the chat needs no change at all.** Today's mechanism
(`SharedDocumentMessage.tsx`) already stores the shared image in the
*sharer's own* root folder and grants the other party a direct-grant key
entry wrapped under the **chat's shared key**, not a freshly negotiated
one - "the owner ... has it in their own root folder ... anyone else only
has the key entry ... wrapped with the chat's shared symmetric key". Since
the chat key is already synchronized across the federation boundary
(decision 7 above), this composes for free: O uploads to his own tree on A
(an ordinary local write) and grants bob's `ForeignUserMapping` id a
direct-grant entry wrapped under the same chat key bob already holds - pure
decisions 1-6, nothing new. Unlike folder contribution (decision 8), the
sharer here always writes into their *own* tree, never someone else's, so
the write-access problem decision 8 exists for never arises.

A subtree granted once for the whole chat, instead of one direct grant per
shared image, was considered and set aside - not merely as a "revisit if
volume grows" optimization, but because it is really just general folder
sharing (see decision 8) applied to chat attachments, and **imagey does not
have folder sharing as a shipped feature yet** (today's sharing is
per-document, via chat, exactly as read above) - `DocumentService`'s
folder-membership plumbing anticipates it (ADR 0004), but there is no
feature yet to extend. Worth reconsidering once/if it exists.

### 8. Contributing to a shared folder needs a scoped exception to decision 3

Prospective - imagey does not have folder sharing as a shipped feature yet
(decision 7's note above); `DocumentService`/ADR 0004 already have the
server-side plumbing for it (a folder's `member`, not just its `owner`, may
add documents to it), so this is worked out now for when that plumbing gets
a feature built on it, not because it is an active gap today.

**The base case - O shares a folder he owns, bob merely reads it, including
nested contents - needs nothing beyond decisions 1-6**, exactly like sharing
a single document: a direct grant, a guest session, and (for nested content)
the client-built `Access-Path` chain verified entirely against A's own
witness data (ADR 0009) - membership there was already decoupled from
account locality, so federation is free here too.

**Contributing a *new* document into somebody else's shared folder is the
one genuinely hard case**, because ADR 0004 decision 3's two-tree write
requires the contributor to own a tree to create the new document in
(`POST /users/{caller}/documents`, `DocumentService.uploadDocument`
persists into `caller`'s own tree) - and a `ForeignUserMapping` principal
has none (decision 3).

An earlier idea - store the new document on the *contributor's own* server
and reference it from the folder's (already domain-qualified, decision 7)
content listing - was considered and rejected: `Access-Path` verification
is inherently single-server, so every *other* member of the folder would
need their own separate direct grant on the contributor's server to see it,
for the folder's whole current *and future* membership. That reintroduces
exactly the O(folder size) write-amplification ADR 0009 rejected Option D
to avoid, and permanently breaks "grant the folder once, everything inside
follows" for any federated contribution.

**The better mechanism: a narrowly scoped exception to decision 3.** A
`ForeignUserMapping` principal may come to own a small number of documents
on the folder's own server (A) - but *only* the ones it directly uploads
via this flow, lazily created on first use, never a root folder, a
Settings document, or registration. `DocumentService.uploadDocument` then
runs completely unmodified: nothing in its path checks account
registration, only `RolesFilter`'s plain string-equality `owner`/`member`
checks (`RolesFilter.java`), so `documentRepository.persist(caller, ...)`
for a foreign `caller` simply creates the storage location on first write,
exactly as it would for any local user. The folder-content update still
lands in O's tree unchanged, and because the new document and its key now
live alongside the rest of the folder on the same server, every other
member - present or future - reaches it through the ordinary witness/
Access-Path machinery, with no per-member grant and no synchronization
burden. "Grant the folder once, everything inside follows" survives fully
intact, including federated contributions.

This does not weaken decision 3's actual safety property: a foreign
`UserId` still can never satisfy `owner` for anything other than the
specific documents it uploaded itself - it was never meant to prevent a
guest from owning *its own* contributions, only from being handed control
of someone else's account-rooted resources.

### What stays unchanged

`PublicKey` wrapping (ENCRYPTION.md), the full `ContactExchange` state
machine (`INVITED`/`ACCEPTED`/`RECEIVED`), chat-key sync (ADR 0004 decision
4), the witness/Access-Path membership model (ADR 0009), and the invitation
e-mail as the offline notification mechanism. `ContactExchange.inviter`/
`invitee` need no schema change - a `ForeignUserMapping`-minted `UserId` is
still just a `UserId` to every existing consumer. `chatId`/`publicProfileId`
do need one - a domain component (decision 7).

Every server that wants to federate needs the same three new pieces
(`.well-known` key publication, the `federated-confirm` redirect page, the
assertion-to-session-token exchange) and nothing operator-specific -
federating with a second or third partner needs no additional integration
work per partner.

## Consequences

- No true real-time delivery across servers; relies on the existing
  invitation e-mail (or an equivalent notification) plus lazy pull next time
  a client bridges both sides. Fine for contacts/document sharing, a
  regression if naively reused for chat.
- One new *unauthenticated-but-signature-verified* endpoint per server (the
  federated session exchange, decision 4) is new attack surface - forging a
  valid assertion needs the partner's private signing key, but the
  `.well-known` key fetch it triggers is structurally an SSRF risk
  (mitigated in decision 5).
- The positive-only, never-invalidated `membershipCache` caveat (ADR 0004,
  ADR 0009 resolved question 9) applies identically to foreign principals -
  no new revocation gap, but no improvement either.
- Purely additive: no change to any existing local flow, no data migration.
- Decision 8 (folder contribution) is prospective, not a fix for a live gap
  - imagey has no shipped folder-sharing feature yet, only per-document
    chat sharing (decision 7). It is worked out now so the mechanism is
    ready if/when that feature lands, not because anything is broken today.
- An accepted version of this ADR would need an implementation plan under
  `docs/plans/`, the way ADR 0009 has
  `docs/plans/hide-access-graph-at-rest.md`.

## Open questions

1. ~~Domain discovery.~~ Resolved: the recipient declares their own home
   server at accept time (decision 2) - the sender never needs to know or
   guess it, and no directory service is needed.
2. ~~Abuse protection~~ Resolved: replay cache, SSRF-hardened key fetch,
   positive/negative caching, and per-IP plus per-unseen-domain rate
   limiting (decision 5). Left open: exactly where this is implemented
   (shared middleware vs. endpoint-specific), for the implementation plan.
3. ~~Federation key rotation/compromise.~~ Resolved: no backup obligation
   (rotation is cheap, nothing at rest depends on the key), verifier-side
   TTL ceiling plus throttled refetch-on-failure bounds the exposure window
   after a compromise, and the actual blast radius is limited to
   impersonating *already-linked* foreign contacts, not forging new ones
   (decision 1).
4. ~~Guest session token TTL.~~ Resolved: shorter than local `ONE_HOUR`
   (~15 min), silently renewed - not because A doesn't control the
   principal (irrelevant once an assertion is honestly verified), but
   because the bearer-token transport (decision 6) is more exposed to
   XSS-class theft than an `HttpOnly` cookie. Does not touch the separate
   `membershipCache` staleness caveat (decision 4).
5. ~~Garbage collection.~~ Resolved: deliberately out of scope. The
   codebase has no account-deletion endpoint and no scheduled cleanup job
   anywhere today, so an unaccepted local invite's placeholder and a
   `UserMappingService` entry are already permanent - a `ForeignUserMapping`
   entry and a rebind-orphaned placeholder tree (decision 3) are the same
   shape of leftover state, not a new one. A future general reaper, if ever
   justified, should cover both uniformly (decision 3).

## Amendment (2026-09-23, ADR 0015)

Decision 7 is superseded in its core premise: the chat is now owned by the
**inviter**, so it always lives on the same server as the `ContactExchange`
(the inviter's home server). Consequences for this ADR:

- There is only one home per chat. The two-step "RECEIVED on A, key filed on
  B as a guest" split of `confirmReceipt` is no longer needed.
- `ContactExchange.chatId` needs no domain component. Domain qualification is
  still needed for the client-side `ContactEntry.owner` and for the
  public-profile ids in the chat metadata.
- A federated invitee accepts, confirms and chats as a guest on the inviter's
  server, using only `member`-scoped calls plus the provisional messages-only
  membership of ADR 0015 decision 4, which compares `UserId`s and therefore
  works for `ForeignUserMapping` principals unchanged.
- The "Sharing an image in the chat" paragraph of decision 7 is unaffected.
