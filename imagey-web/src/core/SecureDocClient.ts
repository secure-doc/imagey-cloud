import { SecureDocError, SecureDocErrorCode } from "./errors/SecureDocError";
import { AuthenticationService } from "./services/AuthenticationService";

export interface SecureDocClientConfig {
  baseUrl: string;
  keys?: {
    privateMainKey?: JsonWebKey;
    privateDeviceKey?: JsonWebKey;
    publicDeviceKey?: JsonWebKey;
  };
}

/**
 * SecureDocClient is the main entry point for the React-independent core library.
 * It encapsulates all API communication and cryptographic operations.
 */
export class SecureDocClient {
  private config: SecureDocClientConfig;
  public readonly auth: AuthenticationService;

  constructor(config: SecureDocClientConfig) {
    this.config = config;
    this.auth = new AuthenticationService(this);
  }

  public setKeys(keys: SecureDocClientConfig["keys"]) {
    this.config.keys = keys;
  }

  public getKeys() {
    return this.config.keys;
  }

  public getBaseUrl() {
    return this.config.baseUrl;
  }

  /**
   * Helper to perform fetch requests with error handling
   */
  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, options);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new SecureDocError(
            "Unauthorized",
            SecureDocErrorCode.UNAUTHORIZED,
          );
        }
        if (response.status === 404) {
          throw new SecureDocError("Not found", SecureDocErrorCode.NOT_FOUND);
        }
        throw new SecureDocError(
          `HTTP Error: ${response.status}`,
          SecureDocErrorCode.NETWORK_ERROR,
        );
      }
      return response;
    } catch (e) {
      if (e instanceof SecureDocError) throw e;
      throw new SecureDocError(
        "Network request failed",
        SecureDocErrorCode.NETWORK_ERROR,
        e,
      );
    }
  }

  // Future integration points for the refactored services:
  // public readonly authentication = new AuthenticationModule(this);
  // public readonly document = new DocumentModule(this);
  // public readonly image = new ImageModule(this);
  // public readonly crypto = cryptoService;
}
