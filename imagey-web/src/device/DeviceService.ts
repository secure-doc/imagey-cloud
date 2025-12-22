import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";

export const deviceService = {
  registerDevice: async (email: string, password: string) => {
    const device = await deviceService.initializeDevice(email, password);
    await authenticationRepository.storePublicDeviceKey(
      email,
      device.deviceId,
      device.deviceKeyPair.publicKey,
    );
  },
  initializeDevice: async (email: string, password: string) => {
    const deviceId = generateDeviceId(email);
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
    email: string,
    deviceId: string,
    decryptedPrivateMainKey: JsonWebKey,
    privateDeviceKeyOfThisDevice: JsonWebKey,
  ) => {
    const thisDeviceId = deviceRepository.loadDeviceId(email);
    if (!thisDeviceId) {
      return Promise.reject("deviceId not found");
    }
    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      email,
      deviceId,
    );
    const encryptedPrivateMainKey = await cryptoService.encryptKey(
      decryptedPrivateMainKey,
      publicDeviceKey,
      privateDeviceKeyOfThisDevice,
    );
    return authenticationRepository.storePrivateMainKey(
      email,
      thisDeviceId,
      deviceId,
      encryptedPrivateMainKey,
    );
  },
  unlockDevice: async (email: string, devicePassword: string) => {
    const deviceId = deviceRepository.loadDeviceId(email);
    if (!deviceId) {
      throw "DeviceId missing";
    }

    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      email,
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
      await authenticationRepository.loadPrivateMainKey(email, deviceId);
    const encryptingDeviceId =
      encryptedPrivateMainKeyMetadata.encryptingDeviceId;
    const encryptingPublicKey =
      await authenticationRepository.loadPublicDeviceKey(
        email,
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

function generateDeviceId(email: string): string {
  const deviceId = cryptoService.generateUuid();
  deviceRepository.storeDeviceId(email, deviceId);
  return deviceId;
}
