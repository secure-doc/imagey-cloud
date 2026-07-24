# Glossary

## Default State (Test Data)
The initial file system state populated from `src/test/resources/data` before any Pact provider test executes. It contains a baseline set of users, devices, keys, documents, and chats used by default unless mutated by a Pact State.

## Pact State
A specific, named setup condition invoked before a Pact contract test interaction. In the frontend, declared via `.given("State Name")`. In the backend, implemented as a `@State("State Name")` method in `ContractTest.java` to prepare the environment (e.g., injecting specific tokens, modifying the Default State).

## Test User Personas
- **Mary (`mary@imagey.cloud`)**: The primary populated test user with devices, documents, and chats. She is the baseline for testing interaction with existing data.
- **Laura (`laura@imagey.cloud`)**: Mary's primary contact and chat partner in the default state.
- **Joe (`joe@imagey.cloud`) / Bill (`bill@imagey.cloud`)**: Empty or minimal users used for "clean slate" testing scenarios (e.g., uploading the first document, registering the first device).

## Channel
A communication context between users. Previously defined implicitly by a pair of emails (e.g., `mary@imagey.cloud:alice@imagey.cloud`), a Channel is transitioning to be uniquely identified by a UUID. This decoupling allows a Channel to be referenced in URLs and APIs securely and consistently without exposing contact details.

## Contact
Another user in the system that a given user can interact with.

## UserId
A globally unique identifier (UUID) assigned to each user upon registration. Replaces the plaintext email address as the primary identifier across the system.

## User Mapping
The process of associating a hashed email address with its corresponding UserId.

## user-ids.json
The central file stored at the root of the `data` directory, containing the mapping from hashed email addresses to UserIds.

## Atomic File Operation
An operation on a file (e.g., rename/move) that is guaranteed by the OS to occur completely or not at all, preventing dirty reads of partially written files.

## Mutual Exclusion (Mutex)
A concurrency control property that prevents multiple threads or processes from simultaneously executing critical sections of code (like modifying the user mapping file).

## HMAC (Hash-based Message Authentication Code)
A specific type of message authentication code involving a cryptographic hash function and a secret cryptographic key. It is used to securely and deterministically hash email addresses.

## Pepper
A highly secure, global secret key used as an input to a hash function (like HMAC). Unlike a salt, a pepper is never stored alongside the hashed data and is typically managed via environment variables or a secrets manager.
