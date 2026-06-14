# 1. In-Memory Storage for Authentication Challenges

Date: 2026-06-14

## Status

Accepted

## Context

We are replacing the email-based login for known devices with an ECDH-based Challenge-Response mechanism. During this process, the server generates a cryptographic challenge (a nonce) and an ephemeral ECDH key pair, which must be temporarily stored until the client responds with the signature/encrypted payload.

We need to decide how and where to store these temporary authentication challenges on the server.

Options considered:
1. **Persistent File Storage**: Writing challenges to disk (similar to `DeviceRepository` or `UserRepository`).
2. **Database Storage**: Using a relational or NoSQL database.
3. **In-Memory Storage**: Using an Application-Scoped Map (e.g. `ConcurrentHashMap`) in the Java backend.

## Decision

We will use **In-Memory Storage** (a Map inside an `@ApplicationScoped` service) to store the authentication challenges. 

The challenges are extremely short-lived (only needed for a few minutes while the user types their local password). Writing them to the filesystem or a database adds unnecessary I/O overhead and persistence for data that inherently has no value after a few minutes or after a server restart.

## Consequences

* **Performance:** High performance with zero I/O latency for challenge verification.
* **Simplicity:** Trivial to implement and clean up (e.g., using a scheduled task or size-limited cache).
* **Clustering Implication:** If the Imagey Server is deployed in a multi-node cluster, an in-memory map will only be available on the node that generated the challenge. This means either:
  1. Load balancers must use **Sticky Sessions** (so the challenge response is routed to the same node).
  2. The storage mechanism must be swapped out for a distributed cache (like Redis or Hazelcast) in the future.

For the current single-server architecture, this decision is optimal. We accept the clustering implication as a future architectural requirement to address when scaling horizontally.
