import { SecureDocClient } from "../SecureDocClient";
import { AuthenticationApi } from "../api/AuthenticationApi";
import { cryptoService } from "../crypto/CryptoService";

export enum RegistrationResult {
  RegistrationStarted,
  AuthenticationStarted,
  ServiceUnavailable,
  Error,
}

export class AuthenticationService {
  private api: AuthenticationApi;

  constructor(private client: SecureDocClient) {
    this.api = new AuthenticationApi(client);
  }

  // Notice how we don't import deviceService natively here yet, because deviceService
  // should ideally also become a core service. For now, we orchestrate the Auth part.

  public async startAuthentication(email: string): Promise<RegistrationResult> {
    try {
      const response = await this.api.startAuthentication(email);
      return response.status === 201
        ? RegistrationResult.RegistrationStarted
        : response.status === 202
          ? RegistrationResult.AuthenticationStarted
          : RegistrationResult.Error;
    } catch (e: any) {
      // The client.fetch throws SecureDocError which we can check
      if (e.name === "SecureDocError" && e.code === "SERVICE_UNAVAILABLE") {
        return RegistrationResult.ServiceUnavailable;
      }
      return RegistrationResult.Error;
    }
  }

  public async loadPrivateMainKey(
    email: string,
    deviceId: string,
    privateDeviceKey: JsonWebKey,
  ): Promise<JsonWebKey> {
    const encryptedPrivateMainKey = await this.api.loadPrivateMainKey(
      email,
      deviceId,
    );
    const publicDeviceKey = await this.api.loadPublicDeviceKey(
      email,
      encryptedPrivateMainKey.encryptingDeviceId,
    );
    const decryptedPrivateMainKey = await cryptoService.decryptKey(
      encryptedPrivateMainKey.key,
      publicDeviceKey,
      privateDeviceKey,
    );
    return decryptedPrivateMainKey;
  }

  public async requestChallenge(
    email: string,
    deviceId: string,
  ): Promise<{ nonce: string; ephemeralPublicKey: JsonWebKey }> {
    return this.api.requestChallenge(email, deviceId);
  }

  public async authenticateWithChallengeSignature(
    email: string,
    deviceId: string,
    signature: string,
    trustedDevice: boolean = false,
  ): Promise<void> {
    await this.api.authenticateWithChallenge(
      email,
      deviceId,
      signature,
      trustedDevice,
    );
  }

  public async storeRecoveryKey(
    email: string,
    deviceId: string,
    recoveryKey: string,
  ): Promise<void> {
    try {
      await this.api.storeRecoveryKey(email, deviceId, recoveryKey);
    } catch (e) {
      console.warn("Failed to store recovery key on server", e);
    }
  }
}
