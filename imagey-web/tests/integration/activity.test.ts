import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysContactRequests,
  prepareMarysDocuments,
  prepareMarysLogin,
  runningPactRequests,
  setupMockServer,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("display image activity in panel", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // The root route (Activities) should display the ImagePanel with Panel
    // Wait for the image panel title (the document name) to be visible inside an h5 (from Panel)
    const panelTitle = page.locator("h5", {
      hasText: "beach-1836467_1920.jpg",
    });
    await expect(panelTitle).toBeVisible({ timeout: 10_000 });

    const imageElement = page.getByAltText("beach-1836467_1920.jpg");
    await expect(imageElement).toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
