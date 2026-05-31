import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysContactRequests,
  prepareMarysDevices,
  prepareMarysDocuments,
  prepareMarysLogin,
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

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

    // Then
    const settingsLink = page.getByRole("link", { name: "Settings" }).first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    const devicesHeading = page.getByRole("heading", { name: "Devices" });
    await expect(devicesHeading).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate from profile to devices via settings list", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDevices();
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Click Settings to go to Profile (desktop default)
    const settingsLink = page.getByRole("link", { name: "Settings" }).first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    // Verify Profile page
    const profileHeading = page
      .getByRole("heading", {
        name: "Profile",
        exact: true,
      })
      .first();
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

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

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

    // Navigate to Profile via Settings list
    const profileLink = page.getByRole("heading", { name: "Profile" }).first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();

    // Then
    const profileHeading2 = page.getByRole("heading", {
      name: "Profile",
      exact: true,
    });
    await expect(profileHeading2).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
