import test, { expect } from "@playwright/test";
import {
  clearLocalStorage,
  inputMarysPassword,
  loginAsMary,
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
    const chatsLink = page.getByText("Chats");
    await expect(chatsLink).toBeVisible();
    chatsLink.click();

    // Then
    await expect(page.getByText("Chats nicht vorhanden")).toBeVisible();
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
    const chatsLink = page
      .getByText("Chats", { exact: true })
      .locator("visible=true");
    await expect(chatsLink).toBeVisible();

    // When
    menuButton.click();

    // Then
    await expect(chatsLink).toHaveCount(0);
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
    const chatsLink = page
      .getByText("Chats", { exact: true })
      .locator("visible=true");
    await expect(chatsLink).toBeVisible();
    chatsLink.click();

    // Then
    await expect(page.getByText("Chats nicht vorhanden")).toBeVisible();
    const chatsLinks = page.getByText("Chats", { exact: true });
    await expect(chatsLinks).not.toBeVisible();
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
    await expect(page.getByText(/Bild nicht gefunden/)).toBeVisible();
  });
});
