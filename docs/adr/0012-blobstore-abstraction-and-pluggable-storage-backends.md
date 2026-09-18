# 12. BlobStore Abstraction and Pluggable Storage Backends

Date: 2026-09-18

## Status

Accepted.

## Context

Storage was 100% filesystem-based: every repository in `cloud.imagey.domain`
extended `AbstractFileRepository`, which wrapped `java.io.File` and
commons-io `FileUtils` directly, rooted at `root.path`. The goal was to add
S3-compatible object storage as a **configurable alternative** - not a
replacement, both backends stay supported - selectable per deployment via
`storage.type`, without forking the five repositories or their tests.

Filesystem and object storage disagree on some basic things a shared
abstraction has to paper over:

- There are no directories in an object store. Every `mkdir`-before-write
  and `exists()`-before-write in the old code existed only because
  `java.io.File` required a parent directory - none of it carries domain
  meaning.
- "Atomic write" means different things: a filesystem write can be made
  atomic with a temp-file-plus-rename; an object store's atomicity is
  whatever its conditional-request semantics (`If-Match`/`If-None-Match`)
  give you, and those differ even between S3-compatible providers (see
  ADR 0011's MinIO finding).
- There is no cross-JVM file lock in an object store - the mechanism ADR
  0006 used for the address-mapping table does not exist there at all
  (see ADR 0010).

## Decision

A single port, `BlobStore` (`cloud.imagey.infrastructure.storage`), with
six methods keyed by an opaque `/`-separated string:

- `get`/`exists` - read
- `put` - unconditional write
- `putIfAbsent` - create-only; the primitive behind every write-once key
  (a shared-key slot, the `account.json` marker, a mapping entry) and every
  get-or-create
- `putIfVersionMatches` - compare-and-swap against a backend-native
  `StoredObject.version`, the primitive optimistic locking on a mutable key
  (a folder's content, see ADR 0011) needs
- `list(prefix, delimiter)` - one-level listing, mirroring S3's
  `ListObjectsV2` prefix/delimiter contract directly, so both `keys()` (files
  in the OS-filesystem sense) and `commonPrefixes()` (subdirectories) have a
  precise, backend-independent meaning

Two implementations: `FilesystemBlobStore` (a straight port of the old
`AbstractFileRepository` logic behind the interface) and `S3BlobStore`
(AWS SDK v2, works against any S3-compatible endpoint via
`endpointOverride` - deliberately provider-agnostic, no Impossible-Cloud- or
any other provider-specific default). `BlobStoreProducer` is the only place
that knows both exist; it selects one via `storage.type`
(`filesystem`, the default, or `s3`) and is the only place that builds an
`S3Client`.

`AbstractFileRepository` now holds an injected `BlobStore` and exposes
key-string based helpers (`join`, `find`, `put`, `createIfAbsent`, ...)
instead of `File`-based ones. Every `mkdir`/`exists()`-before-write in the
five repositories was deleted outright, not translated into a marker
object - `FilesystemBlobStore.put`/`putIfAbsent` create any parent keys
they need internally, the way an object store needs none at all. The one
place a real marker object was needed - `UserRepository`, where "does an
account exist" used to mean "does the home directory exist", satisfied
incidentally by `ContactRepository.persist`'s implicit parent-directory
creation on an invite - got an explicit `account.json` key instead.

### `putIfAbsent` is nicer than the pattern it replaces, on both backends

For `FilesystemBlobStore`, a naive `File#createNewFile()` was tried first
and rejected: it atomically claims the filename, but content is written in
a second step, so a concurrent reader can observe a torn (empty) file in
between. Every write on this backend instead lands complete on a temp file
in the same directory first, then gets published under the real key -
`Files.move(..., ATOMIC_MOVE, REPLACE_EXISTING)` for `put`/the write side
of `putIfVersionMatches`, `Files.createLink` for `putIfAbsent` specifically
(a plain `ATOMIC_MOVE` without `REPLACE_EXISTING` was also tried and
rejected: on POSIX it is backed by `rename(2)`, which has no atomic
"only if absent" mode and was observed to silently overwrite an existing
target instead of failing - `link(2)`, unlike `rename(2)`, does have that
guarantee). This was caught by a real 16-thread concurrency test
(`UserMappingServiceTest`/`BlobStoreContractTest`) before it ever shipped,
not by inspection - both bugs produced clearly wrong, reproducible results
under an actual race.

For `S3BlobStore`, `putIfAbsent` maps onto `PutObjectRequest.ifNoneMatch("*")`
and `putIfVersionMatches` onto `.ifMatch(version)`, with two S3-specific
failure shapes handled distinctly: `412 Precondition Failed` is a
definitive `false` (the condition does not hold), `409
ConditionalRequestConflict` means two conditional writes raced at the same
instant and neither side can tell who should have won, so it is retried a
bounded number of times rather than reported as a loss. `version` is the
backend's own S3 ETag, used only as an opaque CAS token internally - never
the application-level SHA-256 ETag `DocumentRepository` exposes over HTTP,
which stays identical and backend-independent across both storage types.

A related finding, specific to MinIO rather than to this design: a
conditional `PutObject` with `If-Match` against a key that does not exist
at all was observed to be accepted (the key gets created) instead of
rejected with `412`, even though nothing can match on an absent object.
`S3BlobStore.putIfVersionMatches` now checks `exists(key)` explicitly
before attempting the conditional write, rather than assuming every
S3-compatible backend enforces `If-Match` semantics identically - see
ADR 0011 for the full write-up.

## Consequences

- **Positive:** the storage backend is now a deployment-time choice
  (`storage.type`), with `filesystem` as the safe default and no code fork
  between the two.
- **Positive:** net code reduction in the five repositories - the `mkdir`
  ceremony is simply gone, not replaced by something else.
- **Positive:** the two riskiest primitives (`putIfAbsent`,
  `putIfVersionMatches`) are proven under real concurrency, on both
  backends, in CI (`BlobStoreContractTest`, run against a real MinIO
  container via Testcontainers, not a mock), and the production wiring
  (`BlobStoreProducer` with `storage.type=s3`) was verified end to end
  against a live MinIO instance (a real registration request minting a
  user mapping and an account marker, both landing as actual objects in the
  bucket) before this was considered done.
- **Negative:** `BlobStore` is the first place in this codebase where a
  domain-adjacent abstraction is selected via a runtime `@Produces`
  factory read from `MicroProfile Config` rather than compile-time wiring -
  a new pattern for this project, guarded by an ArchUnit rule
  (`noAwsSdkInDomain`, alongside the existing `noJakartaRsInDomain`) so
  `cloud.imagey.domain..` cannot bypass it by reaching for
  `software.amazon.awssdk` directly.
- **Open risk, unchanged from earlier evaluation:** which S3-compatible
  provider's conditional-write and consistency guarantees are safe to rely
  on in production is backend-specific and, for the specific provider under
  evaluation (Impossible Cloud), unverified as of this writing - see ADR
  0011's Impossible Cloud caveat. `storage.type` defaults to `filesystem`
  in production until that is resolved.
- **Hardening from a code review of the initial implementation:** full-jitter
  backoff on `S3BlobStore`'s conditional-write retry (see ADR 0011); a
  duplicate hex-SHA-256 implementation in `FilesystemBlobStore` and
  `DocumentRepository` consolidated into one shared
  `cloud.imagey.infrastructure.common.Sha256`, so the digest algorithm and
  encoding can only be changed in one place; `S3BlobStore#list` filters out
  a zero-byte object whose key equals the listed prefix (a "directory
  marker" some S3 tools create, which `FilesystemBlobStore` can never
  produce - a real directory cannot list itself as its own child); and
  `DocumentResource.updateDocument` routed through `persistIfCurrent` (see
  ADR 0011) - it was found writing the very same `metadata.enc` key
  `uploadDocument`'s folder-content write does, unconditionally.
