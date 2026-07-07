import { Email, JsonWebKeyPairs } from "../contexts/AuthenticationContext";
import { deviceService } from "../device/DeviceService";
import { deviceRepository } from "../device/DeviceRepository";
import { authenticationRepository } from "./AuthenticationRepository";
import { cryptoService } from "./CryptoService";

import { ResponseError } from "./ResponseError";
import { contactService } from "../contact/ContactService";
import { DeviceId, Password, UserId } from "./UserId";

export type Nonce = string;
export type EncryptedRecoveryKey = string;

export enum RegistrationResult {
  RegistrationStarted,
  AuthenticationStarted,
  ServiceUnavailable,
  Error,
}

export const authenticationService = {
  register: async (
    email: Email,
    password: Password,
    inviter?: UserId,
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
    if (inviter) {
      await contactService.acceptContactRequest(email, inviter, mainKeyPair);
    }
    return {
      mainKeyPair,
      deviceKeyPair: device.deviceKeyPair,
    };
  },
  startAuthentication: async (email: Email): Promise<RegistrationResult> => {
    try {
      const response =
        await authenticationRepository.startAuthentication(email);
      return response.status === 201
        ? Promise.resolve(RegistrationResult.RegistrationStarted)
        : response.status === 202
          ? Promise.resolve(RegistrationResult.AuthenticationStarted)
          : Promise.reject(RegistrationResult.Error);
    } catch (e) {
      if (e === ResponseError.SERVICE_UNAVAILABLE) {
        return Promise.resolve(RegistrationResult.ServiceUnavailable);
      }
      return Promise.resolve(RegistrationResult.Error);
    }
  },
  requestChallenge: async (
    email: Email,
    deviceId: DeviceId,
  ): Promise<{ nonce: Nonce; ephemeralPublicKey: JsonWebKey }> => {
    try {
      return await authenticationRepository.requestChallenge(email, deviceId);
    } catch {
      return Promise.reject("Failed to request challenge");
    }
  },
  authenticateWithChallenge: async (
    email: Email,
    deviceId: DeviceId,
    password: Password,
    trustedDevice: boolean = false,
  ): Promise<{ privateMainKey: JsonWebKey; privateDeviceKey: JsonWebKey }> => {
    const challenge = await authenticationService.requestChallenge(
      email,
      deviceId,
    );
    const serverPublicKey = challenge.ephemeralPublicKey;

    const privateDeviceKey = await deviceService.unlockLocalDeviceKey(
      deviceId,
      password,
    );

    const signature = await cryptoService.encryptChallengeNonce(
      challenge.nonce,
      serverPublicKey,
      privateDeviceKey,
    );

    try {
      await authenticationRepository.authenticateWithChallenge(
        email,
        deviceId,
        signature,
        trustedDevice,
      );
    } catch {
      return Promise.reject("Authentication failed");
    }

    if (trustedDevice) {
      const recoveryKeyArray = new Uint8Array(32);
      crypto.getRandomValues(recoveryKeyArray);
      const recoveryKey = Array.from(recoveryKeyArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const encryptedRecoveryDeviceKey =
        await cryptoService.encryptPrivatePasswordKey(
          privateDeviceKey,
          recoveryKey,
        );
      deviceRepository.storeRecoveryKey(deviceId, encryptedRecoveryDeviceKey);

      try {
        await authenticationRepository.storeRecoveryKey(
          email,
          deviceId,
          recoveryKey,
        );
      } catch {
        console.warn("Failed to store recovery key on server");
      }
    }

    const privateMainKey = await authenticationService.loadPrivateMainKey(
      email,
      deviceId,
      privateDeviceKey,
    );

    return { privateMainKey, privateDeviceKey };
  },
  loadPrivateMainKey: async (
    email: Email,
    deviceId: DeviceId,
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
  autoLogin: async (
    email: Email,
    deviceId: DeviceId,
    encryptedRecoveryDeviceKey: EncryptedRecoveryKey,
  ): Promise<{
    privateMainKey: JsonWebKey;
    privateDeviceKey: JsonWebKey;
    publicDeviceKey: JsonWebKey;
  }> => {
    const recoveryKey = await authenticationRepository.loadRecoveryKey(
      email,
      deviceId,
    );
    const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
      encryptedRecoveryDeviceKey,
      recoveryKey,
    );
    const privateMainKey = await authenticationService.loadPrivateMainKey(
      email,
      deviceId,
      privateDeviceKey,
    );
    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      email,
      deviceId,
    );

    return { privateMainKey, privateDeviceKey, publicDeviceKey };
  },
};
