import { contactRepository } from "../contact/ContactRepository";
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
    inviter?: string,
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
      await contactRepository.acceptContactRequest(email, inviter, mainKeyPair);
    }
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
  requestChallenge: async (
    email: string,
    deviceId: string,
  ): Promise<{ nonce: string; ephemeralPublicKey: JsonWebKey }> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/challenges",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
      },
    );
    if (response.ok) {
      return response.json();
    }
    return Promise.reject("Failed to request challenge");
  },
  authenticateWithChallenge: async (
    email: string,
    deviceId: string,
    password: string,
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

    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/authentications",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signature }),
        credentials: "same-origin",
      },
    );

    if (!response.ok) {
      return Promise.reject("Authentication failed");
    }

    const privateMainKey = await authenticationService.loadPrivateMainKey(
      email,
      deviceId,
      privateDeviceKey,
    );

    return { privateMainKey, privateDeviceKey };
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
