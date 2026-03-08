import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  provider,
  setupMockServer,
  setupBillsDevice,
  TestData,
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
    .addInteraction()
    .given("marys document has error")
    .uponReceiving("a request of mary to get documents for error test")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          documentId: "error-doc-id",
          name: "error.jpg",
          previewImageId: "error-preview-id",
          size: 100,
          type: "image/jpeg",
          smallImageId: "small-id",
        },
      ]),
    );

  provider
    .addInteraction()
    .given("marys document has error")
    .uponReceiving("a request of mary to get content that fails")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/error-doc-id/contents/error-preview-id",
      (r) => r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(500);

  await provider
    .addInteraction()
    .given("marys document has error")
    .uponReceiving("a request of mary to get contact requests in error test")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]))
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await loginAsMary(page);
      await expect(page.getByText(/Error loading error.jpg/)).toBeVisible();
    });
});

test("private key loading error", async ({ page }) => {
  // Given
  provider
    .addInteraction()
    .given("default")
    .uponReceiving(
      "a request of bill to get encrypted private main key for device that fails",
    )
    .withRequest(
      "GET",
      `/users/bill@imagey.cloud/devices/${TestData.bill.devices[0].deviceId}/private-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(500);

  await provider
    .addInteraction()
    .given("default")
    .uponReceiving("a request of bill to get public key")
    .withRequest("GET", "/users/bill@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.bill.publicMainKey))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupBillsDevice(page);
      await page.goto("/?email=bill@imagey.cloud");

      const passwordInput = page.getByLabel("password");
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.bill.password);

      // Then
      const confirmButton = page.getByText("Confirm");
      await confirmButton.click();
      await expect(page.getByText("Wrong password")).toBeVisible();
    });
});
