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
import { Matchers } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("mary registers new device", async ({ page }) => {
  // Given
  provider
    .addInteraction()
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicMainKey));

  provider
    .addInteraction()
    .given("default")
    .uponReceiving("a request of mary to store public key for device")
    .withRequest(
      "POST",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/public-keys/`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/public-keys/",
      }),
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: Matchers.string("arFY-wWlA-rikTjcTc62L5ghQ2DaqOStDEdQ2f0nUJ8"),
          y: Matchers.string("UsYeOva7ipzP218Va5RPJR46L1OXybK2vxISuVUAXyw"),
        }),
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get public device key for second device",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/public-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/public-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysSecondPublicDeviceKey));

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get private main key for second device",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/private-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/private-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
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
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get devices")
    .withRequest("GET", "/users/mary@imagey.cloud/devices", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([marysSecondDeviceId, marysDeviceId]),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysSecondPublicDeviceKey));

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to store encrypted private main key for second device",
    )
    .withRequest(
      "POST",
      `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/private-keys/`,
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          kid: "0",
          encryptingDeviceId: marysDeviceId,
          key: Matchers.string(marysEncryptedPrivateMainKeyForSecondDevice),
        }),
    )
    .willRespondWith(200)
    .executeTest(async (mockServer) => {
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
    .addInteraction()
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicMainKey));

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get public device key for second device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysSecondPublicDeviceKey));

  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving(
      "a request of mary to get encrypted private main key for second device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/private-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: marysDeviceId,
        key: marysEncryptedPrivateMainKeyForSecondDevice,
      }),
    );

  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysSecondPublicDeviceKey));

  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get documents for second device")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get public key of first device")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysDeviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicDeviceKey))
    .executeTest(async (mockServer) => {
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
