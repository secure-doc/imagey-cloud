import { deviceService } from "../device/DeviceService";
import { authenticationRepository } from "./AuthenticationRepository";
import { cryptoService } from "./CryptoService";

export enum RegistrationResult {
  RegistrationStarted,
  AuthenticationStarted,
}

export const authenticationService = {
  register: async (
    email: string,
    password: string,
  ): Promise<{
    privateKey: JsonWebKey;
    publicKey: JsonWebKey;
  }> => {
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
      ? Promise.resolve(mainKeyPair)
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
  loadPrivateKey: async (
    email: string,
    deviceId: string,
    privateDeviceKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      email,
      deviceId,
    );
    const encryptedPrivateMainKey =
      await authenticationRepository.loadPrivateKey(email, deviceId);
    const decryptedPrivateMainKey = await cryptoService.decryptKey(
      encryptedPrivateMainKey,
      publicDeviceKey,
      privateDeviceKey,
    );
    return decryptedPrivateMainKey;
  },
};
