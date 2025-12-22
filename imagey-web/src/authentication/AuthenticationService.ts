import { JsonWebKeyPairs } from "../contexts/AuthenticationContext";
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
  ): Promise<JsonWebKeyPairs> => {
    const device = await deviceService.initializeDevice(email, password);

    const mainKeyPair = await cryptoService.initializeKeyPair();
    const encryptedPrivateMainKey = await cryptoService.encryptKey(
      mainKeyPair.privateKey,
      device.deviceKeyPair.publicKey,
      device.deviceKeyPair.privateKey,
    );
    await authenticationRepository.register(
      email,
      device.deviceId,
      mainKeyPair.publicKey,
      encryptedPrivateMainKey,
      device.deviceKeyPair.publicKey,
    );
    return {
      mainKeyPair,
      deviceKeyPair: device.deviceKeyPair,
    };
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
  loadPrivateMainKey: async (
    email: string,
    deviceId: string,
    privateDeviceKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const encryptedPrivateMainKey =
      await authenticationRepository.loadPrivateMainKey(email, deviceId);
    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      email,
      encryptedPrivateMainKey.encryptingDeviceId,
    );
    const decryptedPrivateMainKey = await cryptoService.decryptKey(
      encryptedPrivateMainKey.key,
      publicDeviceKey,
      privateDeviceKey,
    );
    return decryptedPrivateMainKey;
  },
};
