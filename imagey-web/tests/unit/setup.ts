import { beforeAll, afterEach } from "vitest";
import { vi } from "vitest";
import { webcrypto } from "node:crypto";

import { authenticationRepository } from "../../src/authentication/AuthenticationRepository";
import { authenticationService } from "../../src/authentication/AuthenticationService";
import { JsonWebKeyPair } from "../../src/contexts/AuthenticationContext";

export const marysEmail = "mary@imagey.cloud";
export const marysPassword = "MarysPassword123";

export let deviceId1: string;
export let encryptedMainKey: string;
export let mainKeyPair: JsonWebKeyPair;
export let device1KeyPair: JsonWebKeyPair;

/**
 * WebCrypto für Vitest (Node)
 */
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

/**
 * Globales Cleanup für alle Spies
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Einmalige Initialisierung:
 * - fängt register()-Call ab
 * - ruft echten authenticationService.register auf
 * - extrahiert Keys & DeviceId
 */
beforeAll(async () => {
  vi.spyOn(authenticationRepository, "register").mockImplementation(
    async (
      _email,
      deviceId: string,
      _publicMainKey: JsonWebKey,
      encryptedPrivateMainKey: string,
    ) => {
      deviceId1 = deviceId;
      encryptedMainKey = encryptedPrivateMainKey;
    },
  );

  const actualKeyPairs = await authenticationService.register(
    marysEmail,
    marysPassword,
  );

  mainKeyPair = actualKeyPairs.mainKeyPair;
  device1KeyPair = actualKeyPairs.deviceKeyPair;
});
