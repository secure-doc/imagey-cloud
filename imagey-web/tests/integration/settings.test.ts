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

test("navigate to devices", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDevices();
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();
  await prepareMarysEmptyProfile();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    await devicesLink.click();

    // Then
    const deviceEntry = page.getByRole("heading", { name: "This device" });
    await expect(deviceEntry).toBeVisible();
    await expect(
      page.getByText(TestData.mary.devices[0].deviceId),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate to devices on mobile resolution", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");
  await prepareMarysLogin(page);
  await prepareMarysDevices();
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    await devicesLink.click();

    // Then
    const deviceEntry = page.getByText(TestData.mary.devices[0].deviceId);
    await expect(deviceEntry).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate to settings index directly", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  const builder = await prepareMarysDocuments();
  await prepareMarysEmptyProfile();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

    // Then
    const settingsLink = page.getByRole("link", { name: "Settings" }).first();
    await expect(settingsLink).toBeVisible();
    // Settings opens the profile page, which loads the profile document
    // (content GET, then key GET). The "Devices" heading below is part of the
    // settings list and renders before that load finishes, and
    // runningPactRequests briefly dips to 0 between the two GETs - so wait
    // for the key GET explicitly, or the mock server may be torn down while
    // it is still in flight (route.fetch -> ECONNREFUSED, flaky in CI).
    const profileKeyResponse = page.waitForResponse((response) =>
      response
        .url()
        .includes(
          `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${TestData.mary.settings!.profile}/keys/`,
        ),
    );
    await settingsLink.click();

    const devicesHeading = page.getByRole("heading", { name: "Devices" });
    await expect(devicesHeading).toBeVisible();
    await profileKeyResponse;
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate from profile to devices via settings list", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDevices();
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();
  await prepareMarysEmptyProfile();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Wait for the home page's document thumbnails to finish loading before
    // navigating away - prepareMarysDocuments() registers those file requests
    // as expected interactions, and navigating away too early aborts them
    // mid-flight, leaving them unconsumed and failing the mock server
    // verification.
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

    // Click Settings to go to Profile (desktop default)
    const settingsLink = page.getByRole("link", { name: "Settings" }).first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    // Verify Profile page. SettingsList (rendered as the left-hand nav on
    // both the Profile and Devices pages) also has a "Profile" heading of
    // its own (an <h6> list item) - scope to level 5 to match only
    // ProfilePage's own <h5> title and avoid ambiguity with that sidebar
    // item.
    const profileHeading = page.getByRole("heading", {
      name: "Profile",
      exact: true,
      level: 5,
    });
    await expect(profileHeading).toBeVisible();

    // Click Devices in settings list
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    await devicesLink.click();

    // Then
    const deviceEntry = page.getByRole("heading", { name: "This device" });
    await expect(deviceEntry).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
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
    const deviceEntry = page.getByRole("heading", { name: "This device" });
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
