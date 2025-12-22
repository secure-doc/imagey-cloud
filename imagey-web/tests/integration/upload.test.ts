import { test, expect } from "./fixtures";
import path from "path";
import {
  clearLocalStorage,
  loginAsMary,
  marysSmallImageId,
  marysSmallImageName,
  marysUploadedDocumentId,
  marysUploadedDocumentName,
  prepareDocumentUpload,
  prepareMarysDocuments,
  prepareMarysLogin,
  provider,
  runningPactRequests,
  setupMockServer,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("upload image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareDocumentUpload(
    marysUploadedDocumentName,
    marysUploadedDocumentId,
  );

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    expect(await page.getByText("No images found.").isVisible());
    expect(await page.getByAltText("beach-1836467_1920.jpg").isVisible());
    expect(await page.getByAltText("beach-4524911_1920.jpg").isVisible());

    const fileChooserPromise = page.waitForEvent("filechooser");
    const addImageButton = page.locator("*[aria-label='add-image']");
    await expect(addImageButton).toBeVisible();
    addImageButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", marysUploadedDocumentName),
    );

    // Then
    await expect(page.getByAltText(marysUploadedDocumentName)).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload small image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareDocumentUpload(marysSmallImageName, marysSmallImageId);

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    expect(await page.getByAltText("beach-1836467_1920.jpg").isVisible());
    expect(await page.getByAltText("beach-4524911_1920.jpg").isVisible());

    const fileChooserPromise = page.waitForEvent("filechooser");
    const addImageButton = page.locator("*[aria-label='add-image']");
    await expect(addImageButton).toBeVisible();
    addImageButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", marysSmallImageName),
    );

    // Then
    await expect(page.getByAltText(marysSmallImageName)).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
