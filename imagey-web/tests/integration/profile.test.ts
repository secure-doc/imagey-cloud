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
  prepareMarysPublicProfileAvatarPut,
  prepareMarysPublicProfileCreation,
  prepareMarysPublicProfileMetadataPut,
  prepareProfileMetadataSave,
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
  // Both the name and the picture change in this test, so both public-profile
  // triggers fire (§3.5): a fresh public-profile is created (mary has none
  // yet), then its avatar and its name are each written.
  await prepareMarysPublicProfileCreation();
  prepareMarysPublicProfileAvatarPut();
  prepareMarysPublicProfileMetadataPut(" (avatar)");
  prepareMarysPublicProfileMetadataPut(" (name)");

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

test("edit and save profile - name only, no picture change", async ({
  page,
}) => {
  // Given: only the name changes this time, exercising ProfileSaveButton's
  // "name changed, no new picture" branch specifically (distinct from "edit
  // and save profile" above, which changes both).
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysEmptyProfile();
  const saveInteraction = prepareProfileMetadataSave();
  await prepareMarysPublicProfileCreation();
  prepareMarysPublicProfileMetadataPut(" (name only)");

  await saveInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Settings" }).click();
    await page
      .getByRole("heading", { name: "Profile", exact: true })
      .first()
      .click();

    const editNameButton = page.locator("button:has(i:text('edit'))").first();
    await editNameButton.click();
    const nameInput = page.getByLabel("Name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Mary Doe");
    await page.locator("i:text('check')").first().click();

    const responsePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().endsWith(`/documents/${TestData.mary.settings!.profile}`),
    );
    await page.getByRole("button", { name: "Save" }).click();
    await responsePromise;

    await expect(page.getByText("Mary Doe")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("edit and save profile - picture only, no name change", async ({
  page,
}) => {
  // Given: only the picture changes this time, exercising ProfileSaveButton's
  // "picture changed, no name change" branch specifically (distinct from
  // "edit and save profile" above, which changes both).
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysEmptyProfile();
  const saveInteraction = await prepareProfileSave();
  await prepareMarysPublicProfileCreation();
  prepareMarysPublicProfileAvatarPut(" (picture only)");
  prepareMarysPublicProfileMetadataPut(" (picture only)");

  await saveInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Settings" }).click();
    await page
      .getByRole("heading", { name: "Profile", exact: true })
      .first()
      .click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("label", { hasText: "Change Picture" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[3].name),
    );

    const responsePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().endsWith(`/documents/${TestData.mary.settings!.profile}`),
    );
    await page.getByRole("button", { name: "Save" }).click();
    await responsePromise;

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
