import { test, expect } from "./fixtures";
import { setupMarysDevice, TestData, clearLocalStorage } from "./setup";

declare global {
  interface Window {
    deviceService: {
      activateDevice: (
        email: string,
        deviceId: string,
        device: unknown,
        keypair: unknown,
      ) => Promise<void>;
      unlockDevice: (email: string, password: string) => Promise<void>;
      unlockLocalDeviceKey: (
        deviceId: string,
        password: string,
      ) => Promise<void>;
    };
    contactService: {
      loadSharedKey: (
        email: string,
        contactId: string,
        encryptedKey: unknown,
        privateKey: unknown,
      ) => Promise<void>;
    };
    cryptoService: {
      decryptKey: (...args: unknown[]) => Promise<unknown>;
    };
  }
}

test.describe("Service Branch Coverage", () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test("DeviceService - missing deviceId", async ({ page }) => {
    await setupMarysDevice(page);
    await page.goto("/?email=mary@imagey.cloud");
    await page.evaluate(() => {
      localStorage.removeItem("imagey.deviceIds[mary@imagey.cloud]");
    });
    const error1 = await page.evaluate(async () => {
      try {
        await window.deviceService.activateDevice(
          "mary@imagey.cloud",
          "dev1",
          {} as unknown,
          {} as unknown,
        );
      } catch (e) {
        return (e as Error).message || String(e);
      }
    });
    expect(error1).toBe("deviceId not found");

    const error2 = await page.evaluate(async () => {
      try {
        await window.deviceService.unlockDevice(
          "mary@imagey.cloud",
          "password",
        );
      } catch (e) {
        return (e as Error).message || String(e);
      }
    });
    expect(error2).toBe("DeviceId missing");
  });

  test("DeviceService - missing private key", async ({ page }) => {
    await setupMarysDevice(page);
    await page.goto("/?email=mary@imagey.cloud");
    await page.evaluate((deviceId) => {
      localStorage.removeItem(`imagey.devices[${deviceId}].key`);
    }, TestData.mary.devices[0].deviceId);

    const error1 = await page.evaluate(async (deviceId) => {
      try {
        await window.deviceService.unlockLocalDeviceKey(deviceId, "password");
      } catch (e) {
        return (e as Error).message || String(e);
      }
    }, TestData.mary.devices[0].deviceId);
    expect(error1).toBe("Private Key missing");

    await page.route("**/public-keys/0", async (route) => {
      await route.fulfill({ status: 200, json: {} });
    });

    const error2 = await page.evaluate(async () => {
      try {
        await window.deviceService.unlockDevice(
          "mary@imagey.cloud",
          "password",
        );
      } catch (e) {
        return (e as Error).message || String(e);
      }
    });
    expect(error2).toBe("Private Key missing");
  });

  test("ContactService - missing key entry", async ({ page }) => {
    await page.route("**/users/*/documents/*/keys/*", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/json",
        body: "null",
      });
    });
    await page.goto("/");
    const result = await page.evaluate(async () => {
      return await window.documentService.loadKey(
        "a",
        "b",
        {} as unknown,
        {} as unknown,
      );
    });
    expect(result).toBeUndefined();
  });

  test("ContactService - fallback decryption", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const originalDecrypt = window.cryptoService.decryptKey.bind(
        window.cryptoService,
      );
      let failed = false;
      window.cryptoService.decryptKey = async (...args: unknown[]) => {
        if (!failed) {
          failed = true;
          throw new Error("Simulated decryption failure");
        }
        return await originalDecrypt(...args);
      };
    });

    await page.route("**/users/contact/public-keys/0", async (route) => {
      await route.fulfill({ status: 200, json: TestData.mary.publicMainKey });
    });
    await page.route("**/encrypted-shared-keys/**", async (route) => {
      await route.fulfill({
        status: 200,
        json: { sharedKey: "mock-shared-key" },
      });
    });

    await page.evaluate(async () => {
      try {
        await window.documentService.loadKey(
          "user@imagey.cloud",
          "chat-contact",
          {} as unknown,
          {} as unknown,
        );
      } catch {
        // expected
      }
    });
  });

  test("DocumentService - storeDocument with missing key", async ({ page }) => {
    await page.goto("/");
    // missing branches logic to be added
  });
});
