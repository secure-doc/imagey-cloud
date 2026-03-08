import { describe, it, expect, vi, beforeEach } from "vitest";
import { deviceService } from "../../src/device/DeviceService";
import { authenticationRepository } from "../../src/authentication/AuthenticationRepository";
import { cryptoService } from "../../src/authentication/CryptoService";
import { deviceRepository } from "../../src/device/DeviceRepository";

describe("DeviceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("activateDevice", () => {
    it("rejects if deviceId is missing in repository", async () => {
      vi.spyOn(deviceRepository, "loadDeviceId").mockReturnValue(undefined);

      await expect(
        deviceService.activateDevice(
          "test@example.com",
          "other-device-id",
          {} as JsonWebKey,
          {} as JsonWebKey,
        ),
      ).rejects.toEqual("deviceId not found");
    });

    it("successfully activates device", async () => {
      const email = "test@example.com";
      const thisDeviceId = "this-device-id";
      const targetDeviceId = "target-device-id";
      const decryptedPrivateMainKey = { kty: "RSA" } as JsonWebKey;
      const privateDeviceKeyOfThisDevice = { kty: "RSA" } as JsonWebKey;
      const publicDeviceKey = { kty: "RSA" } as JsonWebKey;
      const encryptedPrivateMainKey = "encrypted-main-key";

      vi.spyOn(deviceRepository, "loadDeviceId").mockReturnValue(thisDeviceId);
      vi.spyOn(
        authenticationRepository,
        "loadPublicDeviceKey",
      ).mockResolvedValue(publicDeviceKey);
      vi.spyOn(cryptoService, "encryptKey").mockResolvedValue(
        encryptedPrivateMainKey,
      );
      vi.spyOn(
        authenticationRepository,
        "storePrivateMainKey",
      ).mockResolvedValue(undefined);

      await deviceService.activateDevice(
        email,
        targetDeviceId,
        decryptedPrivateMainKey,
        privateDeviceKeyOfThisDevice,
      );

      expect(deviceRepository.loadDeviceId).toHaveBeenCalledWith(email);
      expect(authenticationRepository.loadPublicDeviceKey).toHaveBeenCalledWith(
        email,
        targetDeviceId,
      );
      expect(cryptoService.encryptKey).toHaveBeenCalledWith(
        decryptedPrivateMainKey,
        publicDeviceKey,
        privateDeviceKeyOfThisDevice,
      );
      expect(authenticationRepository.storePrivateMainKey).toHaveBeenCalledWith(
        email,
        thisDeviceId,
        targetDeviceId,
        encryptedPrivateMainKey,
      );
    });
  });

  describe("unlockDevice", () => {
    it("throws if deviceId is missing", async () => {
      vi.spyOn(deviceRepository, "loadDeviceId").mockReturnValue(undefined);

      await expect(
        deviceService.unlockDevice("test@example.com", "password123"),
      ).rejects.toEqual("DeviceId missing");
    });

    it("rejects if private key is missing", async () => {
      vi.spyOn(deviceRepository, "loadDeviceId").mockReturnValue("some-id");
      vi.spyOn(deviceRepository, "loadKey").mockReturnValue(undefined);
      vi.spyOn(
        authenticationRepository,
        "loadPublicDeviceKey",
      ).mockResolvedValue({ kty: "RSA" } as JsonWebKey);

      await expect(
        deviceService.unlockDevice("test@example.com", "password123"),
      ).rejects.toEqual("Private Key missing");
    });
  });
});
