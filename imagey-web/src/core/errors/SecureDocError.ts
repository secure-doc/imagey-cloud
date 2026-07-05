export enum SecureDocErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  DECRYPTION_FAILED = "DECRYPTION_FAILED",
  ENCRYPTION_FAILED = "ENCRYPTION_FAILED",
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class SecureDocError extends Error {
  public readonly code: SecureDocErrorCode;
  public readonly details?: unknown;

  constructor(message: string, code: SecureDocErrorCode, details?: unknown) {
    super(message);
    this.name = "SecureDocError";
    this.code = code;
    this.details = details;

    // Maintain V8 stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecureDocError);
    }
  }
}

/**
 * Type guard to check if an unknown error is a SecureDocError.
 */
export function isSecureDocError(error: unknown): error is SecureDocError {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as Error).name === "SecureDocError" &&
    "code" in error
  );
}
