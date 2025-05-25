import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";

export const deviceService = {
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
      publicKey: deviceKeyPair.publicKey,
      privateKey: deviceKeyPair.privateKey,
    };
  },
  registerDevice: async (email: string, password: string) => {
    const device = await deviceService.initializeDevice(email, password);
    await authenticationRepository.storePublicDeviceKey(
      email,
      device.deviceId,
      device.publicKey,
    );
    // TODO, this is wrong, device has to be activated by another device
    return device.privateKey;
  },
  setupDevice: async (
    email: string,
    deviceId: string,
    devicePassword: string,
  ) => {
    const publicDeviceKey = await authenticationRepository.loadPublicDeviceKey(
      email,
      deviceId,
    );
    const encryptedDeviceKey = deviceRepository.loadKey(deviceId);
    if (encryptedDeviceKey) {
      const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
        encryptedDeviceKey,
        devicePassword,
      );
      const encryptedPrivateMasterKey =
        await authenticationRepository.loadPrivateKey(email, deviceId);
      return cryptoService.decryptKey(
        encryptedPrivateMasterKey,
        publicDeviceKey,
        privateDeviceKey,
      );
    } else {
      return Promise.reject("Private Key missing");
    }
  },
};

function generateDeviceId(email: string): string {
  const deviceId = crypto.randomUUID();
  deviceRepository.storeDeviceId(email, deviceId);
  return deviceId;
}
