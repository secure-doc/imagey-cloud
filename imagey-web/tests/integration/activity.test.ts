import { test, expect } from "./fixtures";
import * as path from "path";
import {
  clearLocalStorage,
  loginAsBill,
  prepareBillsDocuments,
  prepareBillsDocumentUpload,
  prepareBillsEmptyContactRequests,
  prepareBillsLogin,
  runningPactRequests,
  setupMockServer,
  TestData,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
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

test("empty states on the home page fit a mobile screen", async ({ page }) => {
  // Given
  await page.setViewportSize({ width: 375, height: 812 });
  await prepareBillsLogin(page);
  await prepareBillsEmptyContactRequests();
  const p = await prepareBillsDocuments();

  await p.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsBill(page);

    // When
    await page.getByRole("link", { name: "Home" }).first().click();

    // Then
    const uploadPanel = page.locator("article", { hasText: "Upload Images" });
    const noContactsPanel = page.locator("article", {
      hasText: "No contacts yet?",
    });
    await expect(uploadPanel).toBeVisible();
    await expect(noContactsPanel).toBeVisible();

    // A fixed 400px grid minimum once made every panel wider than the phone.
    for (const panel of [uploadPanel, noContactsPanel]) {
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
    // Only the layout is compared, see screenshot-hide-text.css.
    await expect(page.locator("main")).toHaveScreenshot(
      "home-empty-states-mobile.png",
      { stylePath: "tests/integration/screenshot-hide-text.css" },
    );

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
