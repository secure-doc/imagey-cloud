# ADR 0002: Frontend Core Library Split and Error Handling

## Status
Proposed

## Context
There is a need to decouple the frontend logic from the React framework to allow for better testability, potential reusability in other environments (e.g., React Native, Node.js), and clearer architectural boundaries. The goal is to eventually extract a React-independent "Core Library".

## Decision
1. **Logical Separation First**: Before extracting a completely separate npm package or workspace, the core library will be logically separated into its own directory within the existing `imagey-web/src` folder (e.g., `src/core`).
2. **Scope**: The Core Library will handle API communication (REST/Fetch) and cryptographic operations (encryption/decryption). It will **not** handle state management. State will remain the responsibility of the React UI layer.
3. **Error Handling Strategy**: We will adopt the "Structured Exceptions with Type Guards" pattern, which is the standard among popular TypeScript libraries (e.g., Axios, Stripe SDK, tRPC).
   - We will throw custom error instances (e.g., `ImageyError`) that contain a specific `code` string enum (e.g., `DECRYPTION_FAILED`, `NETWORK_ERROR`).
   - We will expose Type Guards (e.g., `isImageyError(error: unknown)`) so the React UI can safely narrow the type in `catch` blocks and react accordingly.

## Consequences
- The React UI must be updated to use the provided Type Guards in `try/catch` blocks.
- The Core Library functions must remain pure regarding state, meaning they either require context (like encryption keys) to be passed in per call, or they are encapsulated in a class/closure that is initialized by the UI.
