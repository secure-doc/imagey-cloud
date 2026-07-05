# Glossary

## Frontend Architecture
- **Core Library**: A React-independent set of modules responsible for API communication, encryption, and decryption. It contains no UI logic and no state management.
- **React UI**: The presentation layer that manages application state, renders the UI, and consumes the Core Library.
- **Type Guard**: A TypeScript function (e.g., `isImageyError(err)`) used to narrow down the type of an unknown object, typically used in `catch` blocks to safely handle specific error types.
- **Structured Exception**: A custom error class that extends the base `Error` but includes specific, strongly-typed properties like `code` or `details` to facilitate programmatic error handling.
