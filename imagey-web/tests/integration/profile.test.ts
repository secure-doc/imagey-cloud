import { test, expect } from "./fixtures";
import * as path from "path";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  prepareMarysContactRequests,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysEmptyProfile,
  prepareMarysProfile,
  prepareProfileSave,
  runningPactRequests,
  setupMockServer,
  TestData,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("edit and save profile", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysEmptyProfile();
  const saveInteraction = await prepareProfileSave();

  // When
  await saveInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await loginAsMary(page);

    // Go to settings
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    // Go to profile
    const profileLink = page
      .getByRole("heading", { name: "Profile", exact: true })
      .first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();

    // Fill profile
    const editNameButton = page.locator("button:has(i:text('edit'))").first();
    await editNameButton.click();
    const nameInput = page.getByLabel("Name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Mary Doe");
    await page.locator("i:text('check')").first().click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const changePictureButton = page.locator("label", {
      hasText: "Change Picture",
    });
    await expect(changePictureButton).toBeVisible();
    await changePictureButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[3].name),
    );

    const addEmailButton = page.getByText("Add Email");
    await addEmailButton.click();
    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("mary.doe@example.com");
    await emailInput.press("Enter");

    // Cover email removal
    await addEmailButton.click();
    const secondEmailInput = page.getByLabel("Email");
    await expect(secondEmailInput).toBeVisible();
    await secondEmailInput.fill("");
    // Clicking check with empty text will remove it
    await page.locator("i:text('check')").first().click();

    await addEmailButton.click();
    const thirdEmailInput = page.getByLabel("Email");
    await expect(thirdEmailInput).toBeVisible();
    await thirdEmailInput.fill("delete.me@example.com");
    await page.locator("i:text('check')").first().click();
    // Click delete directly
    const deleteButton = page.locator("button:has(i:text('delete'))").last();
    await deleteButton.click();

    const responsePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().endsWith(`/documents/${TestData.mary.settings!.profile}`),
    );
    const saveButton = page.getByRole("button", { name: "Save" });
    await saveButton.click();
    await responsePromise;

    // Then
    await expect(page.getByText("Mary Doe")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("load existing profile with picture", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysEmptyDocumentsFolder();
  const profileInteraction = await prepareMarysProfile();

  // When
  await profileInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await loginAsMary(page);

    // Go to settings
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    // Go to profile
    const profileLink = page
      .getByRole("heading", { name: "Profile", exact: true })
      .first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();

    // Then: wait for profile data to appear
    await expect(page.getByText("Mary Doe")).toBeVisible();

    // Verify the profile picture is loaded (vitalykobzun-frau-7385461.jpg)
    const avatarImage = page.getByRole("img", { name: "Avatar" });
    await expect(avatarImage).toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
