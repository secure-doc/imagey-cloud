import test, { expect } from "@playwright/test";
import {
  clearLocalStorage,
  loginAsMary,
  provider,
  setupMockServer,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate to chats", async ({ page }) => {
  // Given
  await loginAsMary(page);

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/");
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
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
  await loginAsMary(page);
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/");
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
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
  await loginAsMary(page);
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/");
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
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
  await loginAsMary(page);

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/");
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
    await page.goto("/images/5");

    // Then
    await expect(page.getByText(/Bild nicht gefunden/)).toBeVisible();
  });
});
