# 11. Folder-Write Concurrency via Backend Conditional Writes

Date: 2026-09-17

## Status

Accepted.

## Context

`DocumentService.uploadDocument` adds a document to a folder: it stores the
new document in the caller's tree and replaces the folder document's content
(now referencing the new document) in the folder owner's tree. The folder
content itself is entirely client-built - the server never merges concurrent
edits, it only accepts or rejects a client's already-computed replacement.

Until now, correctness against two concurrent uploads into the same folder
rested on a **JVM-local** 64-way striped `synchronized` lock: re-check the
folder's ETag under the lock, then write. The lock's own comment already
said so - it closes the race for a single JVM only. That was an accepted gap
while the backend was one filesystem-backed instance; it stops being
acceptable once the backend can be S3-compatible object storage and the
server can run as multiple instances sharing no local state (the same
motivation behind ADR 0010). A lock that only serialises threads of one
process gives no protection at all between two different instances.

Additionally: the lock only ever changed *how* a losing writer loses (an
immediate 412 outside the lock vs. a brief wait then still a 412 inside it)
- it never changed *whether* the upload was correct, because the server was
always going to re-check the ETag before writing either way. Once a real
conditional write exists to enforce that check, the lock adds nothing but
complexity.

## Decision

Replace the lock with the storage backend's own optimistic-concurrency
primitive, `BlobStore#putIfVersionMatches` (`DocumentRepository
#persistIfCurrent`):

1. `DocumentService.uploadDocument` reads the folder's metadata **once**
   (`DocumentRepository#loadEncryptedMetadataWithETag`), up front, getting
   its application-level ETag (the SHA-256 the client-facing API has always
   used, unchanged - see `DocumentRepository#getETag`'s Javadoc) and its
   backend-native `version` (opaque, `StoredObject#version` - see ADR 0012's
   sibling change to `AbstractFileRepository`) in the same read.
2. If the client sent a `folderETag`, it is compared against that read's
   ETag immediately - a mismatch is a 412, same as before.
3. The new document's content, key and files are stored (unconditional
   writes - these are always-new keys, no concurrency to guard).
4. The folder's new content is written via `persistIfCurrent`,
   conditioned on the `version` from step 1's read - **not** a fresh read at
   this point. If the folder changed since step 1 (by any writer, on any
   instance), the conditional write fails and the whole call is rejected
   with 412.

The striped lock, `FOLDER_LOCK_STRIPES`, and the `DocumentService()`
constructor that populated it are deleted outright, not replaced with a
distributed lock - the conditional write already gives the correctness
guarantee a lock would have added, without needing one.

### `persistIfCurrent` is not folder-specific, and needed a second caller

A folder is not a distinct storage entity - it is a `Document` like any
other, and "a folder's content" is exactly that document's `metadata.enc`
(see `CONTEXT.md`). `DocumentResource.PUT /{documentId}` (`updateDocument`)
can therefore target the very same key `uploadDocument`'s folder-content
write does, whenever the `documentId` being edited happens to be a folder.
A code review caught that the first version of this change left
`updateDocument` on its pre-existing pattern - read the ETag, run it through
`Request#evaluatePreconditions`, then write unconditionally if that passed -
which has exactly the TOCTOU window between the precondition check and the
write that this ADR closes for uploads. `updateDocument` now reads the
document once (the same `loadEncryptedMetadataWithETag` call), evaluates
preconditions from that read, and if they pass, writes via the same
`persistIfCurrent` conditioned on that read's version - a `false` result is
surfaced as the same 412 `evaluatePreconditions` would have produced,
so the HTTP contract does not change, only the enforcement becomes atomic.
This is why the method is named `persistIfCurrent`, not
`persistFolderContentIfCurrent` as first written.

### Behaviour change: an upload with no `folderETag`

Before this change, `folderETag == null` skipped the check entirely and the
write was unconditional - last write wins, even under the JVM lock (the lock
serialised writers but never rejected one that unwittingly clobbered
another, because there was nothing to compare against). After this change,
step 4 above still applies even when the client sent no `folderETag`: the
write is always conditioned on the version read in step 1. A client that
never asked to be told about a conflict can now receive a 412 where it
previously always succeeded.

This is intentional and considered strictly safer than the previous
behaviour - it closes exactly the "document vanishes" race the ETag
mechanism exists to prevent, now for *every* upload rather than only ones
that opted in. No existing test asserted the old unconditional-success
behaviour. Any client that never sends `folderETag` and hits real
concurrent uploads into the same folder should retry the same way it
already needs to on an explicit 412 (re-read the folder, re-apply the
change) - see the existing folder-ETag-concurrency handling on the client
(reload/retry).

## Consequences

- **Positive:** the folder-content race is now closed across multiple app
  instances, not just within one - required for `storage.type=s3` to be
  safe to run horizontally scaled.
- **Positive:** one read instead of two (`validate()` previously read the
  ETag once, the code inside the lock read it again). Less I/O per upload.
- **Positive:** less code - no lock, no stripe array, no constructor.
- **Negative (accepted, see above):** an unconditional upload (no
  `folderETag`) can now fail with 412 under real concurrency, where it
  previously always succeeded.
- **Positive:** `S3BlobStore`'s conditional-write retry (see ADR 0012) uses
  full-jitter exponential backoff between attempts on a `409
  ConditionalRequestConflict`, rather than retrying immediately - the
  scenario this ADR is meant to support (several genuinely concurrent
  uploads into one popular shared folder on the S3 backend) is exactly where
  a tight, unbacked-off retry loop would be most likely to exhaust its
  budget and surface a 500 instead of a clean 412.
- **Known gap (not closed):** the one new branch this ADR adds to
  `DocumentResource.updateDocument` - `persistIfCurrent` returning `false`,
  translated to 412 - has no automated test. Proving it deterministically
  needs a real race between two in-flight requests (mocking the repository
  would be the only alternative, and this codebase has no mocking
  convention to fall back on); a real-but-imprecisely-timed race would be
  flaky. The underlying primitive is proven under real concurrency at the
  `BlobStore`/`DocumentRepository` layer (`BlobStoreContractTest`,
  `DocumentRepositoryTest`); only the one-line translation into an HTTP
  status in the resource layer is unverified by a test.
- **Open risk, carried forward from earlier evaluation:** whether a given
  S3-compatible provider's conditional-write semantics (`If-Match`) and its
  read-after-write consistency guarantees hold is provider-specific and, for
  Impossible Cloud specifically, undocumented as of this writing. This
  mechanism is only as safe as the backend's conditional write actually is -
  verify both before relying on `storage.type=s3` in production against any
  given provider.
