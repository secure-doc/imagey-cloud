import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import {
  clearLocalStorage,
  inputMarysPassword,
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

test("upload image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareDocumentUpload(
    TestData.mary.documents[0].name,
    TestData.mary.documents[0].documentId,
  );
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

    const fileChooserPromise = page.waitForEvent("filechooser");
    const addImageButton = page.locator("*[aria-label='add-image']");
    await expect(addImageButton).toBeVisible();
    await addImageButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[0].name),
    );

    // Then
    await expect(
      page.getByAltText(TestData.mary.documents[0].name),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload portrait", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareDocumentUpload(
    TestData.mary.documents[0].name,
    TestData.mary.documents[0].documentId,
  );
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

    const fileChooserPromise = page.waitForEvent("filechooser");
    const addImageButton = page.locator("*[aria-label='add-image']");
    await expect(addImageButton).toBeVisible();
    await addImageButton.click();
    const imageName = "jillwellington-baby-7463137_1920.jpg";
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join("tests", "images", imageName));

    // Then
    await expect(page.getByAltText(imageName)).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload small image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareDocumentUpload(
    TestData.mary.documents[1].name,
    TestData.mary.documents[1].documentId,
  );
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

    const fileChooserPromise = page.waitForEvent("filechooser");
    const addImageButton = page.locator("*[aria-label='add-image']");
    await expect(addImageButton).toBeVisible();
    await addImageButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[1].name),
    );

    // Then
    await expect(
      page.getByAltText(TestData.mary.documents[1].name),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("upload via share target", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  const imageName = TestData.mary.documents[0].name;
  await prepareDocumentUpload(imageName, TestData.mary.documents[0].documentId);
  const provider = await prepareMarysDocuments();

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    // Read the actual image file in Node.js context and convert to base64
    const imagePath = path.join("tests", "images", imageName);
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Go to root to establish origin, then populate IndexedDB
    await page.goto("/");
    await page.evaluate(
      async ({ name, b64 }) => {
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], name, { type: "image/jpeg" });

        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("ImageyShareStore", 1);
          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("sharedFiles")) {
              db.createObjectStore("sharedFiles", { autoIncrement: true });
            }
          };
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("sharedFiles", "readwrite");
            const store = tx.objectStore("sharedFiles");
            store.add(file);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject();
          };
        });
      },
      { name: imageName, b64: base64Image },
    );

    // Now go to the shared URL and login
    await page.goto("/images?shared=true");
    await inputMarysPassword(page);

    // Wait for the upload logic to trigger and the image to appear.
    await expect(page.getByAltText(imageName).first()).toBeVisible({
      timeout: 10000,
    });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("empty share target", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  const provider = await prepareMarysDocuments();

  // When
  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    // Go to root to establish origin, then clear IndexedDB
    await page.goto("/");
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ImageyShareStore", 1);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("sharedFiles")) {
            db.createObjectStore("sharedFiles", { autoIncrement: true });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("sharedFiles", "readwrite");
          const store = tx.objectStore("sharedFiles");
          store.clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject();
        };
      });
    });

    // Now go to the shared URL and login
    await page.goto("/images?shared=true");
    await inputMarysPassword(page);

    // Then
    // It should strip the ?shared=true and remain on the page without errors
    await expect(page).toHaveURL("http://localhost:5173/images");
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
