import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { deviceRepository } from "./DeviceRepository";
import { Device, DeviceInfo, describeThisDevice } from "./DeviceInfo";

// The encrypted DeviceInfo is padded to a multiple of this many bytes, so its
// size does not give away how long the device's name is (ADR 0017).
const DEVICE_INFO_BLOCK_SIZE = 256;

export const deviceService = {
  registerDevice: async (userId: string, password: string) => {
    const device = await deviceService.initializeDevice(userId, password);
    await authenticationRepository.storePublicDeviceKey(
      userId,
      device.deviceId,
      device.deviceKeyPair.publicKey,
    );
    // Not activated yet, so no private main key: the device encrypts its info
    // with its own private key against the public main key instead.
    const publicMainKey =
      await authenticationRepository.loadPublicMainKey(userId);
    await authenticationRepository.storeDeviceInfo(
      userId,
      device.deviceId,
      await deviceService.encryptDeviceInfo(
        device.info,
        device.deviceKeyPair.privateKey,
        publicMainKey,
        userId,
        device.deviceId,
      ),
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
      info: describeThisDevice(),
    };
  },
  // ownPrivateKey/otherPublicKey are either the device's private key and the
  // public main key or the private main key and the device's public key -
  // both yield the same key (see cryptoService.deriveDeviceInfoKey).
  encryptDeviceInfo: async (
    info: DeviceInfo,
    ownPrivateKey: JsonWebKey,
    otherPublicKey: JsonWebKey,
    userId: string,
    deviceId: string,
  ): Promise<string> => {
    const key = await cryptoService.deriveDeviceInfoKey(
      ownPrivateKey,
      otherPublicKey,
      userId,
      deviceId,
    );
    const json = JSON.stringify(info);
    // Padded in UTF-8 bytes - what is actually encrypted - with spaces, which
    // take one byte each. Trailing whitespace is valid JSON, so the padding
    // needs no framing.
    const length = new TextEncoder().encode(json).length;
    const paddedLength =
      Math.ceil(length / DEVICE_INFO_BLOCK_SIZE) * DEVICE_INFO_BLOCK_SIZE;
    return cryptoService.encryptMessage(
      json + " ".repeat(paddedLength - length),
      key,
    );
  },
  decryptDeviceInfo: async (
    encryptedInfo: string,
    ownPrivateKey: JsonWebKey,
    otherPublicKey: JsonWebKey,
    userId: string,
    deviceId: string,
  ): Promise<DeviceInfo> => {
    const key = await cryptoService.deriveDeviceInfoKey(
      ownPrivateKey,
      otherPublicKey,
      userId,
      deviceId,
    );
    return JSON.parse(await cryptoService.decryptMessage(encryptedInfo, key));
  },
  loadDevices: async (
    userId: string,
    privateMainKey: JsonWebKey,
  ): Promise<Device[]> => {
    const devices = await authenticationRepository.findDevices(userId);
    return Promise.all(
      devices.map(async ({ deviceId, activated, publicKey, info }) => ({
        deviceId,
        activated,
        publicKey,
        // One unreadable info (corrupted, or overwritten by someone without
        // the key) must not take the whole list down: that device is then
        // listed by its id, like one without info.
        info:
          info && publicKey
            ? await deviceService
                .decryptDeviceInfo(
                  info,
                  privateMainKey,
                  publicKey,
                  userId,
                  deviceId,
                )
                .catch((e) => {
                  console.warn(`Cannot decrypt info of device ${deviceId}`, e);
                  return undefined;
                })
            : undefined,
      })),
    );
  },
  renameDevice: async (
    userId: string,
    deviceId: string,
    publicDeviceKey: JsonWebKey,
    info: DeviceInfo,
    name: string,
    privateMainKey: JsonWebKey,
  ): Promise<DeviceInfo> => {
    const renamed = { ...info, name };
    await authenticationRepository.storeDeviceInfo(
      userId,
      deviceId,
      await deviceService.encryptDeviceInfo(
        renamed,
        privateMainKey,
        publicDeviceKey,
        userId,
        deviceId,
      ),
    );
    return renamed;
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
