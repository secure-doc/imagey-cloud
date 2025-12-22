import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  marysDeviceId,
  marysEncryptedPrivateMainKeyForSecondDevice,
  marysPassword,
  marysPublicDeviceKey,
  marysPublicMainKey,
  marysSecondDeviceId,
  marysSecondPublicDeviceKey,
  prepareMarysDocuments,
  prepareMarysLogin,
  provider,
  runningPactRequests,
  setupMockServer,
  setupMarysSecondDevice,
} from "./setup";
import { MatchersV3 } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("mary registers new device", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicMainKey,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to store public key for device")
    .withRequest({
      method: "POST",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/devices/.+/public-keys/",
        "/users/mary@imagey.cloud/devices/" +
          marysSecondDeviceId +
          "/public-keys/",
      ),
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: MatchersV3.string("arFY-wWlA-rikTjcTc62L5ghQ2DaqOStDEdQ2f0nUJ8"),
        y: MatchersV3.string("UsYeOva7ipzP218Va5RPJR46L1OXybK2vxISuVUAXyw"),
      },
    })
    .willRespondWith({
      status: 200,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get public device key for second device",
    )
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/devices/.+/public-keys/0",
        "/users/mary@imagey.cloud/devices/" +
          marysSecondDeviceId +
          "/public-keys/0",
      ),
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysSecondPublicDeviceKey,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get private main key for second device",
    )
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/devices/.+/private-keys/0",
        "/users/mary@imagey.cloud/devices/" +
          marysSecondDeviceId +
          "/private-keys/0",
      ),
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 404,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/?email=mary@imagey.cloud");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill(marysPassword);
    page.getByText("Confirm").click();
    await expect(
      page.getByText(
        /Device registered, you can now activate it with another device/,
      ),
    ).toBeVisible();

    page.getByRole("button", { name: "OK" }).click();

    // Then
    await expect(
      page.getByText(
        /Device registered, but still not unlocked. You need to unlock it with another device/,
      ),
    ).toBeVisible();
  });
});

test("mary unlocks new device", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  provider
    .given("marys second device registered")
    .uponReceiving("a request of mary to get devices")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/devices",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: [marysSecondDeviceId, marysDeviceId],
    });
  provider
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest({
      method: "GET",
      path:
        "/users/mary@imagey.cloud/devices/" +
        marysSecondDeviceId +
        "/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysSecondPublicDeviceKey,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to store encrypted private main key for second device",
    )
    .withRequest({
      method: "POST",
      path:
        "/users/mary@imagey.cloud/devices/" +
        marysSecondDeviceId +
        "/private-keys/",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        kid: "0",
        encryptingDeviceId: marysDeviceId,
        key: MatchersV3.string(marysEncryptedPrivateMainKeyForSecondDevice),
      },
    })
    .willRespondWith({
      status: 200,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    settingsLink.click();
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    devicesLink.click();
    const deviceEntry = page
      .locator("li", { hasText: marysSecondDeviceId })
      .locator("div.max");
    await deviceEntry.click({ force: true }); // force is required, because the onClick is on a parent
    await expect(
      page.getByText(/Do you want to activate the device with id/),
    ).toBeVisible();
    page.getByRole("button", { name: "Confirm" }).click();

    // Then
    await expect(
      page.getByText(/Do you want to activate the device with id/),
    ).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("mary logs into new device", async ({ page }) => {
  // Given
  await setupMarysSecondDevice(page);
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicMainKey,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get public device key for second device",
    )
    .withRequest({
      method: "GET",
      path:
        "/users/mary@imagey.cloud/devices/" +
        marysSecondDeviceId +
        "/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysSecondPublicDeviceKey,
    });
  provider
    .given("marys second device unlocked")
    .uponReceiving(
      "a request of mary to get encrypted private main key for second device",
    )
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/devices/.+/private-keys/0",
        "/users/mary@imagey.cloud/devices/" +
          marysSecondDeviceId +
          "/private-keys/0",
      ),
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: {
        kid: "0",
        encryptingDeviceId: marysDeviceId,
        key: marysEncryptedPrivateMainKeyForSecondDevice,
      },
    });

  provider
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest({
      method: "GET",
      path:
        "/users/mary@imagey.cloud/devices/" +
        marysSecondDeviceId +
        "/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysSecondPublicDeviceKey,
    });
  provider
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get documents for second device")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: [],
    });
  provider
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get public key of first device")
    .withRequest({
      method: "GET",
      path:
        "/users/mary@imagey.cloud/devices/" + marysDeviceId + "/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicDeviceKey,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/?email=mary@imagey.cloud");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill(marysPassword);
    page.getByText("Confirm").click();
    await expect(page.getByText("Confirm")).not.toBeVisible();

    // Then
    await expect(page.getByText("No images found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
