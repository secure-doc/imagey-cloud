import { Email, JsonWebKeyPairs } from "../contexts/AuthenticationContext";
import { deviceService } from "../device/DeviceService";
import { deviceRepository } from "../device/DeviceRepository";
import { authenticationRepository } from "./AuthenticationRepository";
import { cryptoService } from "./CryptoService";

import { ResponseError } from "./ResponseError";
import { contactService } from "../contact/ContactService";
import { contactRepository } from "../contact/ContactRepository";
import { DeviceId, Password, UserId } from "./UserId";
import { documentService } from "../document/DocumentService";

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
    // The three roots have no data dependency on each other - run them in
    // parallel (each is a WebCrypto round-trip).
    const [device, mainKeyPair, settingsKey] = await Promise.all([
      deviceService.initializeDevice(email, password),
      cryptoService.initializeKeyPair(),
      cryptoService.generateSymmetricKey(),
    ]);

    const documentListId = cryptoService.generateUuid();
    const chatListId = cryptoService.generateUuid();
    const profileId = cryptoService.generateUuid();

    // Each bootstrap document (document list, chat list, profile) gets its own
    // symmetric key, wrapped under the settings key, plus its encrypted body.
    // The three are independent of each other, as are the settings blobs below.
    const encryptBootstrapDocument = async (plaintext: string) => {
      const key = await cryptoService.generateSymmetricKey();
      const [wrappedKey, encryptedDocument] = await Promise.all([
        cryptoService.encryptKey(key, settingsKey),
        cryptoService
          .encryptDocument(key, [new TextEncoder().encode(plaintext).buffer])
          .then((blobs) => blobs[0]),
      ]);
      return { wrappedKey, encryptedDocument };
    };

    const [
      encryptedPrivateMainKey,
      encryptedSettingsKey,
      encryptedSettings,
      documentList,
      chatList,
      profile,
    ] = await Promise.all([
      cryptoService.encryptKey(
        mainKeyPair.privateKey,
        device.deviceKeyPair.publicKey,
        device.deviceKeyPair.privateKey,
      ),
      cryptoService.encryptKey(
        settingsKey,
        mainKeyPair.publicKey,
        mainKeyPair.privateKey,
      ),
      cryptoService
        .encryptDocument(settingsKey, [
          new TextEncoder().encode(`
			{
				"documents": "${documentListId}",
				"chats": "${chatListId}",
				"profile": "${profileId}"
			}
		  `).buffer,
        ])
        .then((blobs) => blobs[0]),
      encryptBootstrapDocument(
        `{"documents": [], "type": "folder", "name": "Documents"}`,
      ),
      encryptBootstrapDocument(
        `{"contacts": [], "type": "folder", "name": "Chats"}`,
      ),
      encryptBootstrapDocument(`{"emails": ["${email}"]}`),
    ]);

    await authenticationRepository.register(
      {
        email,
        deviceId: device.deviceId,
        devicePublicKey: device.deviceKeyPair.publicKey,
        mainPublicKey: mainKeyPair.publicKey,
        encryptedPrivateKey: encryptedPrivateMainKey,
        settingsKey: {
          issuer: email,
          kid: "0",
          sharedKey: encryptedSettingsKey,
        },
        documentList: {
          id: documentListId,
          key: {
            issuer: email,
            kid: email,
            sharedKey: documentList.wrappedKey,
          },
        },
        chatList: {
          id: chatListId,
          key: {
            issuer: email,
            kid: email,
            sharedKey: chatList.wrappedKey,
          },
        },
        profile: {
          id: profileId,
          key: {
            issuer: email,
            kid: email,
            sharedKey: profile.wrappedKey,
          },
        },
      },
      {
        settings: encryptedSettings,
        documentList: documentList.encryptedDocument,
        chatList: chatList.encryptedDocument,
        profile: profile.encryptedDocument,
      },
    );
    if (inviter) {
      // The inviter's public main key travels with the invitation itself: it
      // is on our own contact-request entry (the server persisted it there
      // when the invite was sent). No public-key fetch, no key in the link.
      const invitation = (
        await contactRepository.getContactRequests(email)
      ).find(
        (request) =>
          request.inviter === inviter && request.status === "INVITED",
      );
      if (!invitation) {
        throw new Error("No pending invitation from " + inviter + " to accept");
      }
      const settings = await documentService.getSettings(
        email,
        mainKeyPair.publicKey,
        mainKeyPair.privateKey,
      );
      await contactService.acceptContactRequest(
        email,
        inviter,
        invitation.publicKey,
        settings,
        mainKeyPair,
      );
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
