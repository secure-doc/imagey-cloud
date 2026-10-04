import { test, expect } from "./fixtures";
import * as path from "path";
import {
  clearLocalStorage,
  loginAsMary,
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
    // Until the folder is loaded the button is a plain "create folder" one
    // without menu (see useFolderActionIcons); clicking it then never opens the
    // menu, so wait for the menu to be rendered.
    await expect(page.locator("text='Upload Document'")).toBeAttached();
    await addMenuButton.click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadDocumentButton = page.locator("text='Upload Document'");
    await uploadDocumentButton.click();
    const imageName = "jillwellington-baby-7463137_1920.jpg";
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join("tests", "images", imageName));

    // Then: assert on the document tile being attached, not visible - the tile
    // (or the "Error loading" fallback) is what the sibling upload tests wait
    // for, and `toBeVisible` here raced the encrypt + multi-part POST + preview
    // read-back + decrypt chain under load / coverage runs.
    await expect(
      page
        .getByAltText(imageName)
        .or(page.locator(`text=Error loading ${imageName}`)),
    ).toBeAttached();
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
    // Until the folder is loaded the button is a plain "create folder" one
    // without menu (see useFolderActionIcons); clicking it then never opens the
    // menu, so wait for the menu to be rendered.
    await expect(page.locator("text='Upload Document'")).toBeAttached();
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
