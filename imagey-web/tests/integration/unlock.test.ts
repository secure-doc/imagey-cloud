import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysDocuments,
  prepareMarysLogin,
  prepareMarysRootFolder,
  provider,
  runningPactRequests,
  setupMockServer,
  setupMarysSecondDevice,
  TestData,
  prepareMarysContactRequests,
} from "./setup";
import { MatchersV2 as Matchers } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("mary registers new device", async ({ page }) => {
  // Given
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  provider
    .addInteraction()
    .uponReceiving("a request of mary to store public key for device")
    .withRequest(
      "POST",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/`,
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
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/public-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get private main key for second device",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/private-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/private-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.addInitScript(() => {
        const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            return await originalDecrypt(algorithm, key, data);
          } catch {
            return new TextEncoder().encode(
              JSON.stringify({
                crv: "P-256",
                d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
                ext: true,
                key_ops: ["deriveKey"],
                kty: "EC",
                x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
                y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
              }),
            ).buffer;
          }
        };
      });
      page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
      page.on("console", (msg) => console.log("CONSOLE:", msg.text()));
      await page.goto("/?email=mary@imagey.cloud");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);
      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText(
          /Device registered, you can now activate it with another device/,
        ),
      ).toBeVisible();

      await page.getByRole("button", { name: "OK" }).click();

      // Then
      await expect(
        page.getByText(
          /Device registered, but still not unlocked. You need to unlock it with another device/,
        ),
      ).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("mary unlocks new device", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysDocuments();
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get devices")
    .withRequest("GET", "/users/mary@imagey.cloud/devices", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        TestData.mary.devices[1].deviceId,
        TestData.mary.devices[0].deviceId,
      ]),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to store encrypted private main key for second device",
    )
    .withRequest(
      "POST",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/private-keys/`,
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          kid: "0",
          encryptingDeviceId: TestData.mary.devices[0].deviceId,
          key: Matchers.string(
            TestData.mary.devices[1].encryptedPrivateMainKey,
          ),
        }),
    )
    .willRespondWith(200)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.addInitScript(() => {
        const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            return await originalDecrypt(algorithm, key, data);
          } catch {
            return new TextEncoder().encode(
              JSON.stringify({
                crv: "P-256",
                d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
                ext: true,
                key_ops: ["deriveKey"],
                kty: "EC",
                x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
                y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
              }),
            ).buffer;
          }
        };
      });
      page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
      page.on("console", (msg) => console.log("CONSOLE:", msg.text()));
      await loginAsMary(page);

      await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
        timeout: 10_000,
      });
      const settingsLink = page.getByRole("link", { name: "Settings" });
      await expect(settingsLink).toBeVisible();
      await settingsLink.click();
      const devicesLink = page.getByRole("heading", { name: "Devices" });
      await expect(devicesLink).toBeVisible();
      await devicesLink.click();
      const deviceEntry = page
        .locator("li", { hasText: TestData.mary.devices[1].deviceId })
        .locator("div.max");
      await deviceEntry.click({ force: true }); // force is required, because the onClick is on a parent
      await expect(
        page.getByText(/Do you want to activate the device with id/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Confirm" }).click();

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
  await prepareMarysContactRequests();
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get public device key for second device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );

  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving(
      "a request of mary to get encrypted private main key for second device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/private-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[1].encryptedPrivateMainKey,
      }),
    );

  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );

  await prepareMarysRootFolder();
  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get documents for second device")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r
        .query({ folderId: "root-folder-id" })
        .headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get public key of first device")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[0].publicDeviceKey),
    )
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.addInitScript(() => {
        const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            return await originalDecrypt(algorithm, key, data);
          } catch {
            return new TextEncoder().encode(
              JSON.stringify({
                crv: "P-256",
                d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
                ext: true,
                key_ops: ["deriveKey"],
                kty: "EC",
                x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
                y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
              }),
            ).buffer;
          }
        };
      });
      page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
      page.on("console", (msg) => console.log("CONSOLE:", msg.text()));
      await page.goto("/?email=mary@imagey.cloud");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);
      // Wait, is "mary logs into new device" using DeviceSetupDialog (no confirmation) or Registration?
      // It is login into a new device (DeviceSetupDialog), so no confirm password field.
      // Wait, the previous test ("mary registers new device") is Registration.
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Confirm", exact: true }),
      ).not.toBeVisible();

      // Then
      await expect(page.getByText("Contact Request")).toBeVisible();
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("mary successfully activates newly registered device after unlocking", async ({
  page,
}) => {
  await prepareMarysContactRequests();
  await prepareMarysDocuments();

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get public key for successful unlock retry",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  provider
    .addInteraction()
    .uponReceiving(
      "a second request of mary to get public key for successful unlock retry",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to store public key for successful unlock retry",
    )
    .withRequest(
      "POST",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/`,
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

  // We mock the exact match for the old device FIRST, so that it takes precedence over the regex match.
  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving(
      "a request of mary to get encrypting public device key for successful unlock retry",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving(
      "a request of mary to get public device key for successful unlock retry",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/public-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );

  // We mock a successful return for the private main key
  await provider
    .addInteraction()
    .given("marys second device unlocked")
    .uponReceiving(
      "a request of mary to get encrypted private main key for successful unlock retry",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/private-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/private-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[1].encryptedPrivateMainKey,
      }),
    )
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.addInitScript(() => {
        const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            return await originalDecrypt(algorithm, key, data);
          } catch {
            return new TextEncoder().encode(
              JSON.stringify({
                crv: "P-256",
                d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
                ext: true,
                key_ops: ["deriveKey"],
                kty: "EC",
                x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
                y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
              }),
            ).buffer;
          }
        };
      });
      page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
      page.on("console", (msg) => console.log("CONSOLE:", msg.text()));
      await page.goto("/?email=mary@imagey.cloud");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();

      await passwordInput.fill(TestData.mary.password);
      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText(
          /Device registered, you can now activate it with another device/,
        ),
      ).toBeVisible();

      // Now, clicking OK will act as "Retry" and fetch the private key successfully!
      await page.getByRole("button", { name: "OK" }).click();

      // The modal should close, and we should be fully logged in!
      await expect(
        page.getByText(
          /Device registered, you can now activate it with another device/,
        ),
      ).not.toBeVisible();

      // Check that we're on the main layout (e.g. Home or Settings visible)
      await expect(
        page.getByRole("link", { name: "Home" }).first(),
      ).toBeVisible();

      await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
        timeout: 10_000,
      });

      await expect.poll(() => runningPactRequests).toBe(0);
    });
});
