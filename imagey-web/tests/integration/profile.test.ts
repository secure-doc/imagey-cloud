import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import path from "path";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  prepareMarysContactRequests,
  prepareMarysDocuments,
  provider,
  runningPactRequests,
  setupMockServer,
  TestData,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

export async function prepareProfileUpload() {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to upload a profile picture")
    .withRequest("POST", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=----WebKitFormBoundary",
        ),
      });
    })
    .willRespondWith(200);

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  return provider
    .addInteraction()
    .uponReceiving("a request of mary to update profile")
    .withRequest("PUT", "/users/mary@imagey.cloud/profile", (r) => {
      // The profile payload uses multipart/form-data
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=----WebKitFormBoundary",
        ),
      });
    })
    .willRespondWith(200);
}

test("edit and save profile", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysDocuments();
  const profileUploadInteraction = await prepareProfileUpload();

  // When
  await profileUploadInteraction.executeTest(async (mockServer) => {
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

    const fileChooserPromise = page.waitForEvent("filechooser");
    const changePictureButton = page.getByRole("button", {
      name: "Change Picture",
    });
    await expect(changePictureButton).toBeVisible();
    await changePictureButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      path.join("tests", "images", TestData.mary.documents[0].name),
    );

    const addEmailButton = page.getByText("Add Email");
    await addEmailButton.click();
    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("mary.doe@example.com");
    // Click check to close first email
    await page.locator("i:text('check')").first().click();

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
        res.request().method() === "PUT" && res.url().includes("/profile"),
    );
    const saveButton = page.getByRole("button", { name: "Save" });
    await saveButton.click();
    await responsePromise;

    // Then
    await expect(page.getByText("Mary Doe")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
