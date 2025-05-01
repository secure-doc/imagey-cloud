import { AuthenticationError } from "../authentication/AuthenticationError";
import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";

export const deviceService = {
  registerDevice: async (
    email: string,
    password: string,
    deviceId?: string,
  ) => {
    if (!deviceId) {
      deviceId = generateDeviceId(email);
    }
    const keyPair = await cryptoService.initializeKeyPair();
    const encryptedPrivateKey = await cryptoService.encryptPrivateKey(
      keyPair.privateKey,
      password,
    );
    deviceRepository.storeKey(deviceId, encryptedPrivateKey);
    await authenticationRepository.storePublicKey(
      email,
      deviceId,
      keyPair.publicKey,
    );
    return keyPair.privateKey;
  },
  setupDevice: async (email: string, password: string) => {
    const deviceId = deviceRepository.loadDeviceId(email);
    if (deviceId) {
      const encryptedKey = deviceRepository.loadKey(deviceId);
      if (encryptedKey) {
        return cryptoService.decryptPrivateKey(encryptedKey, password);
      } else {
        return Promise.reject(AuthenticationError.PRIVATE_KEY_MISSING);
      }
    } else {
      return deviceService.registerDevice(email, password);
    }
  },
};

function generateDeviceId(email: string): string {
  const deviceId = crypto.randomUUID();
  deviceRepository.storeDeviceId(email, deviceId);
  return deviceId;
}
