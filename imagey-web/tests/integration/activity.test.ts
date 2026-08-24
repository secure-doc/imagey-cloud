import { test, expect } from "./fixtures";
import * as path from "path";
import {
  clearLocalStorage,
  loginAsBill,
  loginAsMary,
  prepareBillsDocuments,
  prepareBillsDocumentUpload,
  prepareBillsEmptyContactRequests,
  prepareBillsLogin,
  prepareMarysContactRequests,
  prepareMarysDocuments,
  prepareMarysLogin,
  runningPactRequests,
  setupMockServer,
  TestData,
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
    page.on("console", (msg) => console.log(msg.text()));
    await loginAsMary(page);
    await page.getByRole("link", { name: "Home" }).click();

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

test("upload image from activity panel", async ({ page }) => {
  // Given
  await prepareBillsLogin(page);
  await prepareBillsEmptyContactRequests();

  const p = await prepareBillsDocumentUpload(
    TestData.mary.documents[3].documentId,
  );
  await prepareBillsDocuments();

  // When
  await p.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsBill(page);

    await page.getByRole("link", { name: "Home" }).click();

    // Trigger file chooser on the upload button in the Activity view
    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadButton = page.locator(
      "article:has-text('Upload Images') button:has(i:text('upload'))",
    );
    await expect(uploadButton).toBeVisible();
    await uploadButton.click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[3].name),
    );

    // After upload, it should switch to ImagePanel and display the title/image
    const panelTitle = page.locator("h5", {
      hasText: TestData.mary.documents[3].name,
    });
    await expect(panelTitle).toBeVisible({ timeout: 10_000 });

    const imageElement = page.getByAltText(TestData.mary.documents[3].name);
    const errorElement = page.locator(".error-text").first();
    await expect(imageElement.or(errorElement)).toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
