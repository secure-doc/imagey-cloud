import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  marysDeviceId,
  marysPassword,
  marysPublicMainKey,
  prepareMarysLogin,
  provider,
  setupMarysDevice,
  setupMockServer,
} from "./setup";
import {} from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("document loading error", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);

  // Manually setup ONE document that fails to load content
  provider
    .given("marys document has error")
    .uponReceiving("a request of mary to get documents for error test")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents",
      headers: { Accept: "application/json" },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: [
        {
          documentId: "error-doc-id",
          name: "error.jpg",
          previewImageId: "error-preview-id",
          size: 100,
          type: "image/jpeg",
          smallImageId: "small-id",
        },
      ],
    });

  provider
    .given("marys document has error")
    .uponReceiving("a request of mary to get content that fails")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents/error-doc-id/contents/error-preview-id",
      headers: { Accept: "application/octet-stream" },
    })
    .willRespondWith({
      status: 500,
    });

  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.getByText(/Error loading error.jpg/)).toBeVisible();
  });
});

test("private key loading error", async ({ page }) => {
  // Given
  provider
    .given("marys private key is invalid")
    .uponReceiving(
      "a request of mary to get encrypted private main key for device that fails",
    )
    .withRequest({
      method: "GET",
      path:
        "/users/mary@imagey.cloud/devices/" + marysDeviceId + "/private-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 500,
    });

  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: { Accept: "application/json" },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicMainKey,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await setupMarysDevice(page);
    await page.goto("/?email=mary@imagey.cloud");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill(marysPassword);

    // Then
    const confirmButton = page.getByText("Confirm");
    await confirmButton.click();
    await expect(page.getByText("Wrong password")).toBeVisible();
  });
});
