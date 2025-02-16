import { test, expect } from "playwright-test-coverage";
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
