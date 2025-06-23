import { deviceService } from "../device/DeviceService";
import { cryptoService } from "./CryptoService";

export enum RegistrationResult {
  RegistrationStarted,
  AuthenticationStarted,
}

export const authenticationService = {
  register: async (email: string, password: string): Promise<JsonWebKey> => {
    const device = await deviceService.initializeDevice(email, password);

    const mainKeyPair = await cryptoService.initializeKeyPair();
    const encryptedPrivateMainKey = await cryptoService.encryptKey(
      mainKeyPair.privateKey,
      device.publicKey,
      device.privateKey,
    );
    const response = await fetch("/users/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        email: email,
        deviceId: device.deviceId,
        devicePublicKey: device.publicKey,
        mainPublicKey: mainKeyPair.publicKey,
        encryptedPrivateKey: encryptedPrivateMainKey,
      }),
    });
    return response.status >= 200 && response.status < 300
      ? Promise.resolve(mainKeyPair.privateKey)
      : Promise.reject();
  },
  startAuthentication: async (email: string): Promise<RegistrationResult> => {
    const response = await fetch("/users/" + email + "/verifications/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    });
    return response.status === 201
      ? Promise.resolve(RegistrationResult.RegistrationStarted)
      : response.status === 202
        ? Promise.resolve(RegistrationResult.AuthenticationStarted)
        : Promise.reject();
  },
};
