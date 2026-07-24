# ADR 0002: File-Based User Mapping Concurrency Strategy

## Status
Accepted

## Context
The application maintains a centralized mapping of hashed email addresses to `UserIds` in a single JSON file (`user-ids.json`). We have explicitly decided *against* using a Database or a Key-Value Store for this purpose. 
However, the application is designed to scale horizontally (Scenario B: multiple instances running in parallel). This creates a significant risk of concurrent writes leading to "lost updates" and "dirty reads" if multiple instances attempt to register new users or update the file simultaneously.

## Decision
We will employ a combination of OS-level File Locks and Atomic File Operations to secure the mapping file:

1.  **Atomic File Operations (Preventing Dirty Reads):** The application will never write directly to the `user-ids.json` file. Updates will be written to a temporary file (`user-ids.json.tmp`), which will then be atomically moved/renamed over the existing file using `java.nio.file.Files.move(..., StandardCopyOption.ATOMIC_MOVE)`.
2.  **OS-level File Locking (Preventing Lost Updates):** To ensure mutual exclusion across multiple JVM instances during the read-modify-write cycle, the application will acquire an OS-level file lock (using `java.nio.channels.FileLock` on a dedicated lock file, e.g., `user-ids.lock`) before reading the JSON file, and release it only after the atomic move is complete.

## Consequences
*   **Positive:** Safe concurrent access across multiple instances without the overhead or infrastructure dependencies of an external database.
*   **Negative:** OS-level file locking can be unreliable on certain distributed or shared file systems (e.g., some configurations of NFS, EFS). The deployment environment must guarantee POSIX lock compliance on the volume where `data` is mounted. If this guarantee cannot be met, this architectural decision will fail under load.
*   **Performance:** A global lock on user registration limits throughput. This is acceptable for user registration but might become a bottleneck if the file is updated very frequently.
