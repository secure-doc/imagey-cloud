import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysContactRequests,
  prepareMarysDevices,
  prepareMarysDocuments,
  prepareMarysEmptyProfile,
  prepareMarysLogin,
  provider,
  runningPactRequests,
  setupMockServer,
  TestData,
  prepareMarysNewDeviceInfo,
  prepareMarysSessionBinding,
  rejectOnceAsUnbound,
  decryptMarysDeviceInfo,
} from "./setup";
import { MatchersV2 as Matchers } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

async function prepareMarysDevicesPage(page: Page) {
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysEmptyProfile();
  await prepareMarysDevices();
  return prepareMarysDocuments();
}

async function openDevices(page: Page) {
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
  const secondDevice = page.locator("li", {
    has: page.getByRole("heading", { name: "Safari on iOS" }),
  });
  await expect(secondDevice).toBeVisible();
  return secondDevice;
}

function deviceListReload(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith("/devices"),
  );
}

test("mary renames her second device", async ({ page }) => {
  // Given
  await prepareMarysDevicesPage(page);
  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("mary is signed in with her first device")
    .uponReceiving("a request of mary to store renamed info of second device")
    .withRequest(
      "PUT",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/info`,
      (r) =>
        r
          .headers({ "Content-Type": "application/json" })
          .jsonBody(Matchers.string(TestData.mary.devices[1].encryptedInfo!)),
    )
    .willRespondWith(200)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      const secondDevice = await openDevices(page);

      // When
      const nameInput = page.getByLabel("Device name");
      await page
        .locator("li", {
          has: page.getByRole("heading", { name: "Mary's MacBook" }),
        })
        .getByRole("button", { name: "Rename device" })
        .click();
      await expect(nameInput).toHaveValue("Mary's MacBook");
      await page.locator(".overlay").click();
      await expect(nameInput).not.toBeVisible();

      await secondDevice.getByRole("button", { name: "Rename device" }).click();
      await expect(nameInput).toHaveValue("");
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(nameInput).not.toBeVisible();

      await secondDevice.getByRole("button", { name: "Rename device" }).click();
      // 64 characters, but 192 UTF-8 bytes: the padding has to count bytes.
      await nameInput.fill("€".repeat(64));
      const storedInfo = page.waitForRequest(
        (request) =>
          request.method() === "PUT" && request.url().endsWith("/info"),
      );
      const reload = deviceListReload(page);
      await page.getByRole("button", { name: "Save" }).click();

      // Then
      await expect(nameInput).not.toBeVisible();
      // The server only ever sees ciphertext of a padded length: IV, two
      // 256-byte blocks, GCM tag.
      const body = JSON.parse((await storedInfo).postData()!);
      expect(Buffer.from(body, "base64").length).toBe(12 + 512 + 16);
      await reload;
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

function renamedInfoInteraction(name: string, signedIn: boolean) {
  let builder = provider
    .addInteraction()
    .given("marys second device registered");
  if (signedIn) {
    builder = builder.given("mary is signed in with her first device");
  }
  return builder
    .uponReceiving(name)
    .withRequest(
      "PUT",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/info`,
      (r) =>
        r
          .headers({ "Content-Type": "application/json" })
          .jsonBody(Matchers.string(TestData.mary.devices[1].encryptedInfo!)),
    );
}

test("mary cannot rename a device with a session that is not bound to a device", async ({
  page,
}) => {
  // Given
  await prepareMarysDevicesPage(page);
  await renamedInfoInteraction(
    "a request of mary to store renamed info without a bound session",
    false,
  )
    .willRespondWith(403)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      // Binding the session is tested below, here the challenge is refused.
      await page.route("**/challenges", (route) =>
        route.fulfill({ status: 500 }),
      );
      const secondDevice = await openDevices(page);

      // When
      await secondDevice.getByRole("button", { name: "Rename device" }).click();
      await page.getByLabel("Device name").fill("Mary's iPhone");
      await page.getByRole("button", { name: "Save" }).click();

      // Then
      await expect(page.getByText("Error renaming device")).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("mary renames a device after her session was bound to her device", async ({
  page,
}) => {
  // Given
  await prepareMarysDevicesPage(page);
  prepareMarysSessionBinding();
  await renamedInfoInteraction(
    "a request of mary to store renamed info with a bound session",
    true,
  )
    .willRespondWith(200)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await rejectOnceAsUnbound(page, "**/devices/*/info");
      const secondDevice = await openDevices(page);
      const challenges: string[] = [];
      const recoveryKeys: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/challenges")) {
          challenges.push(request.url());
        }
        if (request.url().endsWith("/recovery-key")) {
          recoveryKeys.push(request.url());
        }
      });

      // When
      await secondDevice.getByRole("button", { name: "Rename device" }).click();
      await page.getByLabel("Device name").fill("Mary's iPhone");
      const reload = deviceListReload(page);
      await page.getByRole("button", { name: "Save" }).click();

      // Then
      await expect(page.getByLabel("Device name")).not.toBeVisible();
      await reload;
      expect(challenges).toHaveLength(1);
      // Binding the session must not rotate the recovery key.
      expect(recoveryKeys).toHaveLength(0);
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("mary sees an error when the server still refuses renaming after binding", async ({
  page,
}) => {
  // Given
  const builder = await prepareMarysDevicesPage(page);
  prepareMarysSessionBinding();
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.route("**/devices/*/info", (route) =>
      route.fulfill({ status: 403 }),
    );
    const secondDevice = await openDevices(page);

    // When
    await secondDevice.getByRole("button", { name: "Rename device" }).click();
    await page.getByLabel("Device name").fill("Mary's iPhone");
    await page.getByRole("button", { name: "Save" }).click();

    // Then
    await expect(page.getByText("Error renaming device")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("mary sees an error when renaming a device fails", async ({ page }) => {
  // Given
  const builder = await prepareMarysDevicesPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    // Registered after setupMockServer, so it takes precedence over its
    // catch-all proxy route.
    await page.route("**/devices/*/info", (route) =>
      route.fulfill({ status: 500 }),
    );
    const secondDevice = await openDevices(page);

    // When
    await secondDevice.getByRole("button", { name: "Rename device" }).click();
    await page.getByLabel("Device name").fill("Mary's iPhone");
    await page.getByRole("button", { name: "Save" }).click();

    // Then
    await expect(page.getByText("Error renaming device")).toBeVisible();
    await expect(page.getByLabel("Device name")).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("mary cancels activating her second device", async ({ page }) => {
  // Given
  const builder = await prepareMarysDevicesPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    const secondDevice = await openDevices(page);

    // When
    await secondDevice.locator("div.max").click();
    const question = page.getByText(
      "Do you want to activate the device Safari on iOS?",
    );
    await expect(question).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Then
    await expect(question).not.toBeVisible();
    // An activated device offers no activation.
    await page
      .locator("li", {
        has: page.getByRole("heading", { name: "Mary's MacBook" }),
      })
      .locator("div.max")
      .click();
    await expect(page.getByText(/Do you want to activate/)).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test.describe("on an iPad", () => {
  // iPadOS 13+ identifies as a Mac; only the touch screen gives it away.
  test.use({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  });

  test("a newly registered device stores its encrypted info", async ({
    page,
  }) => {
    // Given
    provider
      .addInteraction()
      .uponReceiving("a request of mary to get public key")
      .withRequest(
        "GET",
        "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
        (r) => r.headers({ Accept: "application/json" }),
      )
      .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));
    prepareMarysNewDeviceInfo();
    await provider
      .addInteraction()
      .uponReceiving("a request of mary to store public key for device")
      .withRequest(
        "POST",
        Matchers.regex({
          generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/public-keys/`,
          matcher:
            "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/.+/public-keys/",
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
      .willRespondWith(200)
      .executeTest(async (mockServer) => {
        await setupMockServer(page, mockServer);
        await page.addInitScript(() =>
          Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }),
        );
        const publicKeyRequest = page.waitForRequest(
          (request) =>
            request.method() === "POST" &&
            request.url().endsWith("/public-keys/"),
        );
        const infoRequest = page.waitForRequest(
          (request) =>
            request.method() === "PUT" && request.url().endsWith("/info"),
        );

        // When
        await page.goto(
          "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
        );
        await page.getByLabel("Password", { exact: true }).fill("NewPassword1");
        await page.getByLabel("Confirm Password").fill("NewPassword1");
        await page
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await expect(
          page.getByText(
            /Device registered, you can now activate it with another device/,
          ),
        ).toBeVisible();

        // Then
        const deviceId = (await infoRequest)
          .url()
          .match(/devices\/([^/]+)\/info$/)![1];
        const info = await decryptMarysDeviceInfo(
          JSON.parse((await infoRequest).postData()!),
          deviceId,
          JSON.parse((await publicKeyRequest).postData()!),
        );
        expect(info).toEqual({
          browser: "Safari",
          os: "iPadOS",
          type: "tablet",
          createdAt: expect.any(String),
        });
        await expect.poll(() => runningPactRequests).toBe(0);
      });
  });
});
