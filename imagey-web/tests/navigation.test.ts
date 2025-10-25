import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  inputMarysPassword,
  loginAsMary,
  marysDeviceId,
  prepareMarysDevices,
  prepareMarysDocuments,
  prepareMarysLogin,
  provider,
  setupMockServer,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate to chats", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const chatsLink = page.getByRole("link", { name: "Chats" });
    await expect(chatsLink).toBeVisible();
    chatsLink.click();

    // Then
    await expect(page.getByText("No chats available")).toBeVisible();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

test("open and close navigation drawer on mobile resolution", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
  });
  const page = await context.newPage();
  await page.goto("/");

  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const menuButton = page.locator("button[aria-label='main-menu']");
    await expect(menuButton).toBeVisible();
    menuButton.click();
    const chatsLink = page.getByRole("link", { name: "Chats" });
    await expect(chatsLink).toHaveCount(2);

    // When
    await page.getByRole("banner").click({ position: { x: 411, y: 457 } });

    // Then
    await expect(chatsLink).toHaveCount(1);
  });
});

test("navigate to chats on mobile resolution", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const menuButton = page.locator("button[aria-label='main-menu']");
    await expect(menuButton).toBeVisible();
    menuButton.click();
    const chatsLink = page.getByRole("link", { name: "Chats" });
    await expect(chatsLink).toHaveCount(2);
    chatsLink.first().click();

    // Then
    await expect(page.getByText("No chats available")).toBeVisible();
    const chatsLinks = page.getByRole("link", { name: "Chats" });

    await expect(chatsLinks).toHaveCount(1);
  });
});

test("navigate to image details", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    await page.goto("/images/5");
    await inputMarysPassword(page);

    // Then
    await expect(page.getByText(/No image found/)).toBeVisible();
  });
});

test("navigate to devices and back on mobile resolution", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysDevices();

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
    const deviceEntry = page.getByRole("heading", { name: marysDeviceId });
    await expect(deviceEntry).toBeVisible();
    const backButton = page.getByRole("button", { name: "back-button" });
    await expect(backButton).toBeVisible();
    backButton.click();

    // Then
    await expect(backButton).not.toBeVisible();
    await expect(deviceEntry).not.toBeVisible();
    await expect(devicesLink).toBeVisible();
    const mainMenu = page.getByRole("button", { name: "main-menu" });
    await expect(mainMenu).toBeVisible();
  });
});
