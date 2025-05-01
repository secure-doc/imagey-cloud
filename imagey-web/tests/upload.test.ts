import test, { expect } from "@playwright/test";
import path from "path";
import {
  clearLocalStorage,
  loginAsMary,
  provider,
  setupMockServer,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("upload image", async ({ page }) => {
  // Given
  await loginAsMary(page);

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const addImageButton = page.locator("*[aria-label='add-image']");
    await expect(addImageButton).toBeVisible();
    addImageButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join("tests", "setup.ts"));
  });

  // Then
  await expect(page.getByText("setup.ts")).toBeVisible();
});
