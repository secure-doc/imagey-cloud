import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import * as fs from "fs";
import * as path from "path";
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
    await page.locator("i:text('check')").first().click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const changePictureButton = page.locator("label", {
      hasText: "Change Picture",
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

test("load existing profile with picture", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysDocuments();

  const profileMockPath = path.join(
    process.cwd(),
    "tests",
    "integration",
    "profile_mock.json",
  );
  const profileMock = JSON.parse(fs.readFileSync(profileMockPath, "utf8"));

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her profile")
    .withRequest("GET", "/users/mary@imagey.cloud/profile", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(profileMock));

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her profile picture key")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile-pic-doc-id/keys/mary@imagey.cloud",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: fs
          .readFileSync(
            "./tests/images/encrypted/profile-pic-doc-id/keys/mary@imagey.cloud/encrypted-shared.key",
            "utf8",
          )
          .trim(),
      }),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her profile picture")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile-pic-doc-id/files/profile-pic-doc-id",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "./tests/images/encrypted/profile-pic-doc-id/files/profile-pic-doc-id",
      ),
    );

  const profileContentInteraction = provider
    .addInteraction()
    .uponReceiving("a request of mary to get her profile content")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile/files/profile",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "./tests/images/encrypted/profile/files/profile",
      ),
    );

  await profileContentInteraction.executeTest(async (mockServer) => {
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
    page.on("pageerror", (err) =>
      console.log("BROWSER PAGEERROR:", err.message, err.stack),
    );

    // Use the mock server URLs but override the page routes
    await setupMockServer(page, mockServer);

    // Explicitly override the default mocks from setupMockServer for /profile and document contents
    await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
      if (route.request().method() === "GET") {
        const response = await route.fetch({
          url: mockServer.url + "/users/mary@imagey.cloud/profile",
          headers: route.request().headers(),
        });
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });

    await page.route(
      "**/users/mary*imagey.cloud/documents/profile-pic-doc-id/keys/mary*imagey.cloud",
      async (route) => {
        if (route.request().method() === "GET") {
          const response = await route.fetch({
            url:
              mockServer.url +
              "/users/mary@imagey.cloud/documents/profile-pic-doc-id/keys/mary@imagey.cloud",
            headers: route.request().headers(),
          });
          await route.fulfill({ response });
        } else {
          await route.continue();
        }
      },
    );

    await page.route(
      "**/users/mary*imagey.cloud/documents/profile/files/profile",
      async (route) => {
        if (route.request().method() === "GET") {
          const response = await route.fetch({
            url:
              mockServer.url +
              "/users/mary@imagey.cloud/documents/profile/files/profile",
            headers: route.request().headers(),
          });
          await route.fulfill({ response });
        } else {
          await route.continue();
        }
      },
    );

    await page.route(
      "**/users/mary*imagey.cloud/documents/profile-pic-doc-id/files/profile-pic-doc-id",
      async (route) => {
        if (route.request().method() === "GET") {
          const response = await route.fetch({
            url:
              mockServer.url +
              "/users/mary@imagey.cloud/documents/profile-pic-doc-id/files/profile-pic-doc-id",
            headers: route.request().headers(),
          });
          await route.fulfill({ response });
        } else {
          await route.continue();
        }
      },
    );

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
    // The profile picture panel should contain an image element
    const avatarImage = page.getByRole("img", { name: "Avatar" });
    await expect(avatarImage).toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
