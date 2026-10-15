import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysDocuments,
  prepareMarysEmptyProfile,
  prepareMarysLogin,
  provider,
  runningPactRequests,
  setupMockServer,
  TestData,
  prepareMarysContactRequests,
  prepareMarysDevices,
  prepareMarysSessionBinding,
  rejectOnceAsUnbound,
} from "./setup";
import { MatchersV2 as Matchers } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

// "activates": the write is accepted. "binds": the first attempt is rejected as
// coming from an unbound session (ADR 0018), the session is bound to this
// device and the retry succeeds. "refused": the server never accepts it.
async function unlockNewDevice(
  page: Page,
  mode: "activates" | "binds" | "refused",
) {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysDocuments();
  // Clicking "Settings" (desktop nav) navigates straight to
  // /settings/profile, so ProfilePage's own document fetch needs a mock too
  // before we can get to the Devices page from there.
  await prepareMarysEmptyProfile();
  await prepareMarysDevices();
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key of second device")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );

  if (mode === "binds") {
    prepareMarysSessionBinding();
  }
  let store = provider.addInteraction().given("marys second device registered");
  if (mode !== "refused") {
    store = store.given("mary is signed in with her first device");
  }
  await store
    .uponReceiving(
      mode === "refused"
        ? "a request of mary to store encrypted private main key without a bound session"
        : "a request of mary to store encrypted private main key for second device",
    )
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/private-keys/`,
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          kid: "0",
          encryptingDeviceId: TestData.mary.devices[0].deviceId,
          key: Matchers.string(
            TestData.mary.devices[1].encryptedPrivateMainKey,
          ),
        }),
    )
    .willRespondWith(mode === "refused" ? 403 : 200)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      if (mode === "binds") {
        await rejectOnceAsUnbound(page, "**/devices/*/private-keys/");
      } else if (mode === "refused") {
        // The session cannot be bound, so the write is not retried.
        await page.route("**/challenges", (route) =>
          route.fulfill({ status: 500 }),
        );
      }
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
        .locator("li", { hasText: "Safari on iOS" })
        .locator("div.max");
      await expect(deviceEntry).toContainText("Waiting for activation");
      await deviceEntry.click({ force: true }); // force is required, because the onClick is on a parent
      const question = page.getByText(
        "Do you want to activate the device Safari on iOS?",
      );
      await expect(question).toBeVisible();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Registered on 9/20/2026")).toBeVisible();
      await expect(
        dialog.getByText(`ID: ${TestData.mary.devices[1].deviceId}`),
      ).toBeVisible();
      // Activating reloads the device list; wait for that reload so the mock
      // server is not torn down while it is still in flight.
      const reload =
        mode === "refused"
          ? undefined
          : page.waitForResponse(
              (response) =>
                response.request().method() === "GET" &&
                response.url().endsWith("/devices"),
            );
      const challenges: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/challenges")) {
          challenges.push(request.url());
        }
      });
      await page.getByRole("button", { name: "Confirm" }).click();

      // Then
      if (mode === "refused") {
        await expect(page.getByText("Error activating device")).toBeVisible();
        await expect.poll(() => runningPactRequests).toBe(0);
        return;
      }
      await expect(question).not.toBeVisible();
      await reload;
      expect(challenges.length).toBe(mode === "binds" ? 1 : 0);
      await expect.poll(() => runningPactRequests).toBe(0);
    });
}

test("mary unlocks new device after her session was bound to her device", async ({
  page,
}) => {
  await unlockNewDevice(page, "binds");
});

test("mary cannot unlock a new device with a session that is not bound to a device", async ({
  page,
}) => {
  await unlockNewDevice(page, "refused");
});
