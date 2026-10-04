import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysContactRequests,
  prepareMarysDevices,
  prepareMarysDocuments,
  prepareMarysLogin,
  prepareMarysEmptyProfile,
  setupMockServer,
  TestData,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate from devices to profile via settings list", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDevices();
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();
  // This test visits the profile page twice (once implicitly via the
  // desktop Settings link, once explicitly via the settings list), so the
  // empty-profile fixture must be registered twice - each registration is
  // matched (and consumed) exactly once by Pact's mock server.
  await prepareMarysEmptyProfile(" (first visit)");
  await prepareMarysEmptyProfile(" (second visit)");

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Wait for the home page's document thumbnails to finish loading before
    // navigating away - prepareMarysDocuments() registers those requests as
    // expected interactions, and navigating away too early can abort them
    // mid-flight, leaving them unconsumed and destabilizing the mock server
    // for the rest of the test (as seen with the profile document being
    // fetched a second time later on).
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

    // Go to Settings -> Profile
    const settingsLink = page.getByRole("link", { name: "Settings" }).first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    // Go to Devices
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    await devicesLink.click();

    // Verify on Devices page
    const deviceEntry = page.getByRole("heading", { name: "Mary's MacBook" });
    await expect(deviceEntry).toBeVisible();

    // Navigate to Profile via Settings list. ProfilePage's own <h5> "Profile"
    // title (asserted below) renders unconditionally on mount, before Mary's
    // (empty) profile document/key fetch even starts - so waiting for that
    // heading doesn't guarantee the fetch has finished, or even started. Wait
    // for the profile document key response explicitly (the second, and
    // last, of the two requests that fetch fires) so the runningPactRequests
    // poll below can't observe a dip to 0 while that fetch is still pending -
    // which is what let Pact's mock server tear down mid-request, causing the
    // "route.fetch: connect ECONNREFUSED" seen on the second profile GET.
    const profileKeyResponse = page.waitForResponse((response) =>
      response
        .url()
        .includes(`/documents/${TestData.mary.settings!.profile}/keys/`),
    );
    const profileLink = page.getByRole("heading", { name: "Profile" }).first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await profileKeyResponse;

    // Then. Must scope to level 5 (ProfilePage's own <h5> title) - without
    // it, this locator is already satisfied by SettingsList's <h6>"Profile"
    // sidebar item, which is on screen on the Devices page even before this
    // click navigates anywhere.
    const profileHeading2 = page.getByRole("heading", {
      name: "Profile",
      exact: true,
      level: 5,
    });
    await expect(profileHeading2).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
