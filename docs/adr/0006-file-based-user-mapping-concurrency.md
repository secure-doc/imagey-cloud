# 6. File-Based User Mapping Concurrency

Date: 2026-09-01

## Status

Accepted

## Context

The address-to-`UserId` lookup table (ADR 0005) is a single JSON file,
`<root.path>/user-ids.json`. We deliberately keep it a file rather than
introducing a database or key-value store just for this one map. The application
is meant to scale horizontally, so several JVMs may try to register a new user -
appending to the file - at the same time, which risks lost updates and dirty
reads of a half-written file.

## Decision

`UserMappingService` guards the read-modify-write cycle with two OS mechanisms:

1. **Atomic replace.** The file is never written in place. A new version is
   written to `user-ids.json.tmp` and then swapped in with
   `Files.move(..., ATOMIC_MOVE, REPLACE_EXISTING)`, so a concurrent reader sees
   either the whole old map or the whole new one.
2. **Cross-JVM lock.** Before the read, the service takes an exclusive
   `java.nio.channels.FileLock` on a dedicated `user-ids.lock` file, and holds it
   until after the atomic move. Only one instance runs the cycle at a time.

## Consequences

- **Positive:** safe concurrent registration across instances with no external
  infrastructure.
- **Negative:** OS file locking is unreliable on some network filesystems (NFS,
  EFS in certain modes). The deployment must put `root.path` on a volume with
  working POSIX locks; if it cannot, this decision fails under load.
- **Performance:** a global lock serialises user registration. Acceptable for
  registration frequency; it would be a bottleneck for a high-write map.
