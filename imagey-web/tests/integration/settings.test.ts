import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  marysDeviceId,
  prepareMarysDevices,
  prepareMarysDocuments,
  prepareMarysLogin,
  setupMockServer,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate to devices", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDevices();
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
    settingsLink.click();
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();

    // Then
    const deviceEntry = page.getByRole("heading", { name: "This device" });
    await expect(deviceEntry).toBeVisible();
    await expect(page.getByText(marysDeviceId)).toBeVisible();
  });
});

test("navigate to devices on mobile resolution", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await prepareMarysLogin(page);
  await prepareMarysDevices();
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
    settingsLink.click();
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    devicesLink.click();

    // Then
    const deviceEntry = page.getByText(marysDeviceId);
    await expect(deviceEntry).toBeVisible();
  });
});
