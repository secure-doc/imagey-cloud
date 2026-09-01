import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";

export const deviceService = {
  registerDevice: async (userId: string, password: string) => {
    const device = await deviceService.initializeDevice(userId, password);
    await authenticationRepository.storePublicDeviceKey(
      userId,
      device.deviceId,
      device.deviceKeyPair.publicKey,
    );
  },
  initializeDevice: async (userId: string, password: string) => {
    const deviceId = generateDeviceId(userId);
    const deviceKeyPair = await cryptoService.initializeKeyPair();
    const encryptedPrivateDeviceKey =
      await cryptoService.encryptPrivatePasswordKey(
        deviceKeyPair.privateKey,
        password,
      );
    deviceRepository.storeKey(deviceId, encryptedPrivateDeviceKey);
    return {
      deviceId,
      deviceKeyPair,
    };
  },
  activateDevice: async (
    userId: string,
    deviceId: string,
    decryptedPrivateMainKey: JsonWebKey,
    privateDeviceKeyOfThisDevice: JsonWebKey,
  ) => {
    const thisDeviceId = deviceRepository.loadDeviceId(userId);
    if (!thisDeviceId) {
      return Promise.reject("deviceId not found");
    }
    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      userId,
      deviceId,
    );
    const encryptedPrivateMainKey = await cryptoService.encryptKey(
      decryptedPrivateMainKey,
      publicDeviceKey,
      privateDeviceKeyOfThisDevice,
    );
    return authenticationRepository.storePrivateMainKey(
      userId,
      thisDeviceId,
      deviceId,
      encryptedPrivateMainKey,
    );
  },
  unlockLocalDeviceKey: async (deviceId: string, devicePassword: string) => {
    const encryptedPrivateDeviceKey = deviceRepository.loadKey(deviceId);
    if (!encryptedPrivateDeviceKey) {
      return Promise.reject("Private Key missing");
    }
    return cryptoService.decryptPrivatePasswordKey(
      encryptedPrivateDeviceKey,
      devicePassword,
    );
  },
  unlockDevice: async (userId: string, devicePassword: string) => {
    const deviceId = deviceRepository.loadDeviceId(userId);
    if (!deviceId) {
      throw "DeviceId missing";
    }

    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      userId,
      deviceId,
    );
    const encryptedPrivateDeviceKey = deviceRepository.loadKey(deviceId);
    if (!encryptedPrivateDeviceKey) {
      return Promise.reject("Private Key missing");
    }

    const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
      encryptedPrivateDeviceKey,
      devicePassword,
    );
    const encryptedPrivateMainKeyMetadata =
      await authenticationRepository.loadPrivateMainKey(userId, deviceId);
    const encryptingDeviceId =
      encryptedPrivateMainKeyMetadata.encryptingDeviceId;
    const encryptingPublicKey =
      await authenticationRepository.loadPublicDeviceKey(
        userId,
        encryptingDeviceId,
      );
    const decryptedPrivateMainKey = await cryptoService.decryptKey(
      encryptedPrivateMainKeyMetadata.key,
      encryptingPublicKey,
      privateDeviceKey,
    );

    return {
      privateMainKey: decryptedPrivateMainKey,
      deviceKeyPair: {
        publicKey: publicDeviceKey,
        privateKey: privateDeviceKey,
      },
    };
  },
};

function generateDeviceId(userId: string): string {
  const deviceId = cryptoService.generateUuid();
  deviceRepository.storeDeviceId(userId, deviceId);
  return deviceId;
}
