# 2. Pact States and Default Test Data Strategy

Date: 2026-07-05

## Status
Proposed

## Context
Our contract tests (Pact) currently utilize a large number of specific `@State` annotations in the backend (`ContractTest.java`) and `.given()` declarations in the frontend. Many of these states exist solely to prepare "clean slate" environments (e.g., deleting a user's contacts or documents) or to set up chat scenarios with specific users (e.g., Alice or Bill) by modifying the primary test user's data (Mary).

This approach leads to:
1. High maintenance overhead when test data models change.
2. Slower test setup due to redundant file system manipulations for each state.
3. Obfuscation of the default test dataset, as states aggressively mutate it.

## Decision
We will consolidate testing scenarios to utilize the **Default State** (`src/test/resources/data`) as much as possible, mapping distinct test scenarios to distinct test users already present in the default data. 

Specifically:
- **Populated User (`mary@imagey.cloud`)**: Used for scenarios requiring existing data (multiple devices, contacts, documents, and chats). Mary will be pre-configured with two devices in the default state.
- **Empty User (`joe@imagey.cloud` or `bill@imagey.cloud`)**: Used for "clean slate" scenarios such as initial uploads or having no contacts, eliminating states like `mary has no documents` and `mary has no contacts`.
- **Chat Partner (`laura@imagey.cloud`)**: Used for chat tests, as Laura already has an established chat with Mary in the default data, eliminating the need for `Mary has a chat with alice` states.
- **Token Injection & Special States**: We will preserve explicit auth states (`User is unauthenticated`, `User has invalid token`). To handle cross-user operations (e.g., Laura accessing Mary's shared document), we will introduce targeted states (e.g., `Laura accesses Marys document`) to instruct the backend to inject the correct caller's token instead of the resource owner's token.

## Consequences
- **Positive**: Reduction in explicit Pact states. Faster contract test execution. Clearer separation of test personas.
- **Negative**: Frontend integration tests must be updated to route to the correct user personas (e.g., logging in as Joe instead of Mary for empty-state tests).
