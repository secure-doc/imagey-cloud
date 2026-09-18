# 10. User Mapping via One Object per Entry

Date: 2026-09-17

## Status

Accepted. Supersedes ADR 0006.

## Context

ADR 0006 kept the address-to-`UserId` lookup table (ADR 0005) in a single
shared file, `<root.path>/user-ids.json`, guarded by a process-wide
`ReentrantLock` (threads of one JVM) plus a cross-JVM `java.nio.channels.FileLock`
on a sidecar `user-ids.lock` file, and published a change by writing a temp
file and atomically renaming it over the target.

The backend is being made storage-pluggable (`BlobStore`, filesystem or an
S3-compatible object store) so it can run against object storage and scale
horizontally across JVM instances with no shared local disk. Both halves of
ADR 0006's mechanism assume a POSIX filesystem: object storage has no file
locks, and `FileLock` is a JVM/OS-level primitive with nothing analogous in
an S3-style API. ADR 0006 already flagged this class of risk for NFS/EFS;
object storage removes the primitive entirely rather than merely making it
unreliable.

## Decision

Split the single shared map into **one object per mapping**, keyed
`index/email-hash/<hmac>` (the same HMAC-SHA256(email) key ADR 0007 already
mandates), with the `UserId` as the object's entire content - no JSON
envelope needed for a single scalar value.

`registerUser` becomes a get-or-create built on one `BlobStore` primitive,
`putIfAbsent`: the first caller to create the key wins; every other caller -
including one racing on a different JVM instance - reads back that winner's
id with a plain `get` instead of minting and persisting its own. No lock is
taken on either backend:

- **Filesystem** (`FilesystemBlobStore`): `putIfAbsent` publishes via
  `Files.createLink` (POSIX `link(2)`) onto a temp file that already holds
  the complete content - `link(2)` fails atomically with
  `FileAlreadyExistsException` if the target name is taken, even across
  multiple JVM processes on the same disk. (A plain `ATOMIC_MOVE` without
  `REPLACE_EXISTING` was tried first and rejected: on POSIX it is backed by
  `rename(2)`, which has no atomic "only if absent" mode and was observed to
  silently overwrite an existing target instead of failing.)
- **S3-compatible storage** (`S3BlobStore`, added later): `putIfAbsent` maps
  onto a conditional `PutObject` with `If-None-Match: *`.

## Consequences

- **Positive:** registration is safe across parallel JVM instances with no
  lock and no single file whose corruption or unavailability affects every
  address at once - a damaged or slow write to one mapping object no longer
  has any bearing on any other address.
- **Positive:** simpler code. `UserMappingService` no longer needs `Jsonb`,
  `ReentrantLock`, `FileChannel`/`FileLock`, or a temp-file-plus-rename dance
  of its own - it is now six short methods built on `BlobStore`.
- **Negative:** many small objects instead of one small file. For the
  filesystem backend this means many small files instead of one; for S3 it
  means one `PutObject`/`GetObject` call per lookup or registration instead
  of amortizing many entries into a single read. Acceptable at registration
  frequency (see ADR 0006's own performance note, which still applies) and
  the pricing plans under evaluation charge nothing per API call.
- **Negative:** `Files.createLink` requires the temp file and the target key
  to live on the same filesystem and (like ADR 0006's `FileLock`) is not
  guaranteed to work on all network filesystems - the same NFS/EFS caveat
  ADR 0006 raised carries forward unchanged for `storage.type=filesystem`
  deployments; it does not apply to `storage.type=s3`.
- The `user-ids.json` fixture and its ADR-0007-mandated HMAC keying scheme
  are otherwise unaffected - only the storage shape of the mapping changed,
  not how a key is derived from an address.
- **A real bug this made reachable, found and fixed:** `RegistrationFilter`
  calls `UserService.create(user)` with whatever userId
  `UserMappingService#registerUser` resolved - and once `registerUser` is
  genuinely safe across concurrent, cross-instance racers (the whole point
  of this ADR), two racers for the *same address* now reliably converge on
  the *same* userId and can both reach `create()` for it. `create()` still
  had the old `exists()`-then-`persist()` check - non-atomic - so the loser
  could hit `persist()`'s create-only write after the winner, get a
  `ResourceConflictException`, and surface it as an uncaught 500. Caught by
  an HTTP-level concurrency test (`RegistrationFilterTest
  #concurrentRegistrationsAgreeOnOneAccount`, several real concurrent
  `GET /registrations/{token}` calls for one fresh address) that the
  service-level `UserMappingServiceTest` race test could not have caught,
  since it never exercises `UserService.create` at all. Fixed by having
  `create()` rely on `persist()`'s own atomic result and treat the conflict
  as success rather than pre-checking non-atomically.
