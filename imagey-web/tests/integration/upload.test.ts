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
  prepareDocumentUpload,
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

test("upload image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareDocumentUpload(TestData.mary.documents[3].documentId);
  const provider = await prepareMarysDocuments();

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByText("Upload Images")).not.toBeVisible();
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    expect(await page.getByRole("link", { name: "Images" }).isVisible());
    await page.getByRole("link", { name: "Images" }).click();

    const addMenuButton = page.locator("*[aria-label='add-menu']");
    await expect(addMenuButton).toBeVisible();
    await addMenuButton.click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadDocumentButton = page.locator("text='Upload Document'");
    await uploadDocumentButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[3].name),
    );

    // Then
    await expect(
      page
        .getByAltText(TestData.mary.documents[3].name)
        .or(
          page.locator(`text=Error loading ${TestData.mary.documents[3].name}`),
        ),
    ).toBeAttached();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload portrait", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareDocumentUpload(TestData.mary.documents[3].documentId);
  const provider = await prepareMarysDocuments();

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    expect(await page.getByRole("link", { name: "Images" }).isVisible());
    await page.getByRole("link", { name: "Images" }).click();

    const addMenuButton = page.locator("*[aria-label='add-menu']");
    await expect(addMenuButton).toBeVisible();
    await addMenuButton.click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadDocumentButton = page.locator("text='Upload Document'");
    await uploadDocumentButton.click();
    const imageName = "jillwellington-baby-7463137_1920.jpg";
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join("tests", "images", imageName));

    // Then
    await expect(
      page
        .getByAltText(imageName)
        .or(page.locator(`text=Error loading ${imageName}`)),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload small image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareDocumentUpload(TestData.mary.documents[4].documentId);
  const provider = await prepareMarysDocuments();

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    expect(await page.getByAltText("beach-4524911_1920.jpg").isVisible());
    expect(await page.getByRole("link", { name: "Images" }).isVisible());
    await page.getByRole("link", { name: "Images" }).click();

    const addMenuButton = page.locator("*[aria-label='add-menu']");
    await expect(addMenuButton).toBeVisible();
    await addMenuButton.click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadDocumentButton = page.locator("text='Upload Document'");
    await uploadDocumentButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[4].name),
    );

    // Then
    await expect(
      page
        .getByAltText(TestData.mary.documents[4].name)
        .or(
          page.locator(`text=Error loading ${TestData.mary.documents[4].name}`),
        ),
    ).toBeAttached();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload image from empty state", async ({ page }) => {
  // Given
  // Bill has no documents yet, so he already starts from an empty state.
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

    expect(await page.getByRole("link", { name: "Images" }).isVisible());
    await page.getByRole("link", { name: "Images" }).click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadImagesTitle = page.locator("text=Upload Images");
    await expect(uploadImagesTitle).toBeVisible();

    // Click the actual upload button inside the panel (has the 'upload' icon)
    const uploadButton = page.locator("button:has(i:text('upload'))");
    await uploadButton.click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[3].name),
    );

    // Then
    await expect(
      page
        .getByAltText(TestData.mary.documents[3].name)
        .or(
          page.locator(`text=Error loading ${TestData.mary.documents[3].name}`),
        ),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
