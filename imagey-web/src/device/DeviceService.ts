import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { authenticationService } from "../authentication/AuthenticationService";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";

export const deviceService = {
  setupDevice: async (email: string, symmetricKey?: JsonWebKey) => {
    if (!symmetricKey) {
      try {
        symmetricKey = await authenticationService.loadSymmetricKey(email);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    deviceRepository.storeUser(email);
    let deviceId = deviceRepository.loadDeviceId(email);
    let privateKey = undefined;
    if (!deviceId) {
      deviceId = generateDeviceId();
      privateKey = await initializePrivateKey(email, deviceId, symmetricKey);
    } else {
      const encryptedPrivateKey = deviceRepository.loadKey(deviceId);
      if (encryptedPrivateKey) {
        privateKey = await cryptoService.decryptPrivateKey(
          encryptedPrivateKey,
          symmetricKey,
        );
      } else {
        privateKey = await initializePrivateKey(email, deviceId, symmetricKey);
      }
    }
    return privateKey;
  },
};

function generateDeviceId(): string {
  return crypto.randomUUID();
}

async function initializePrivateKey(
  email: string,
  deviceId: string,
  symmetricKey: JsonWebKey,
  token?: string,
): Promise<JsonWebKey> {
  const keyPair = await cryptoService.initializeKeyPair();
  authenticationRepository.storeKey(email, deviceId, keyPair.publicKey, token);
  const encryptedKey = await cryptoService.encryptPrivateKey(
    keyPair.privateKey,
    symmetricKey,
  );
  deviceRepository.storeKey(deviceId, encryptedKey);
  return keyPair.privateKey;
}
