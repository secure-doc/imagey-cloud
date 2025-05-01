import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";

export const deviceService = {
  setupDevice: async (email: string) => {
    deviceRepository.storeUser(email);
    let deviceId = deviceRepository.loadDeviceId(email);
    let privateKey = undefined;
    if (!deviceId) {
      deviceId = generateDeviceId();
      privateKey = await initializePrivateKey(email, deviceId);
    } else {
      const encodedPrivateKey = deviceRepository.loadKey(deviceId);
      if (encodedPrivateKey) {
        privateKey = JSON.parse(encodedPrivateKey);
      } else {
        privateKey = await initializePrivateKey(email, deviceId);
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
): Promise<JsonWebKey> {
  const keyPair = await cryptoService.initializeKeyPair();
  authenticationRepository.storeKey(email, deviceId, keyPair.publicKey);
  deviceRepository.storeKey(deviceId, JSON.stringify(keyPair.privateKey));
  return keyPair.privateKey;
}
