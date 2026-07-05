import { SecureDocClient } from "../SecureDocClient";
import { Email } from "../../contexts/AuthenticationContext"; // Ensure path is correct, or move types to core later

export class AuthenticationApi {
  constructor(private client: SecureDocClient) {}

  public async register(
    email: Email,
    deviceId: string,
    publicMainKey: JsonWebKey,
    encryptedPrivateMainKey: string,
    publicDeviceKey: JsonWebKey,
  ): Promise<void> {
    await this.client.fetch("/users/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email,
        deviceId,
        mainPublicKey: publicMainKey,
        devicePublicKey: publicDeviceKey,
        encryptedPrivateKey: encryptedPrivateMainKey,
      }),
    });
  }

  public async startAuthentication(email: string): Promise<Response> {
    return this.client.fetch(`/users/${email}/verifications/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });
  }

  public async requestChallenge(
    email: string,
    deviceId: string,
  ): Promise<{ nonce: string; ephemeralPublicKey: JsonWebKey }> {
    const response = await this.client.fetch(
      `/users/${email}/devices/${deviceId}/challenges`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      },
    );
    return response.json();
  }

  public async authenticateWithChallenge(
    email: string,
    deviceId: string,
    signature: string,
    trustedDevice: boolean,
  ): Promise<void> {
    const query = trustedDevice ? "?trusted=true" : "";
    await this.client.fetch(
      `/users/${email}/devices/${deviceId}/authentications${query}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
        credentials: "same-origin",
      },
    );
  }

  public async loadPrivateMainKey(
    email: string,
    deviceId: string,
  ): Promise<{ kid: string; encryptingDeviceId: string; key: string }> {
    const response = await this.client.fetch(
      `/users/${email}/devices/${deviceId}/private-keys/0`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
    return response.json();
  }

  public async loadPublicDeviceKey(
    email: string,
    deviceId: string,
  ): Promise<JsonWebKey> {
    const response = await this.client.fetch(
      `/users/${email}/devices/${deviceId}/public-keys/0`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
    return response.json();
  }

  public async loadRecoveryKey(
    email: string,
    deviceId: string,
  ): Promise<string> {
    const response = await this.client.fetch(
      `/users/${email}/devices/${deviceId}/recovery-key`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
    return response.json();
  }

  public async storeRecoveryKey(
    email: string,
    deviceId: string,
    recoveryKey: string,
  ): Promise<void> {
    await this.client.fetch(
      `/users/${email}/devices/${deviceId}/recovery-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recoveryKey),
        credentials: "same-origin",
      },
    );
  }
}
