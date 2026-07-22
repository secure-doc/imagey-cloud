import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  inputMarysPassword,
  loginAsMary,
  prepareMarysContactRequests,
  prepareMarysDevices,
  prepareMarysDocuments,
  prepareMarysLogin,
  provider,
  setupMockServer,
  TestData,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate to chats", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  const given = provider
    .addInteraction()
    .given("Mary has declined lauras invitation")
    .uponReceiving("a request of mary to get contact requests")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await given.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    await page.waitForTimeout(10_000);
    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Then
    await expect(page.getByText("No contacts yet?")).toBeVisible();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("open and close navigation drawer on mobile resolution", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");

  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const menuButton = page.locator("button[aria-label='main-menu']");
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    const chatsLink = page.getByRole("link", { name: "Chats" });
    await expect(chatsLink).toHaveCount(2);

    // When
    await page.mouse.click(411, 457);

    // Then
    await expect(chatsLink).toHaveCount(1);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate to chats on mobile resolution", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");
  await prepareMarysLogin(page);

  await prepareMarysDocuments();

  const given = provider
    .addInteraction()
    .given("Mary has declined lauras invitation")
    .uponReceiving("a request of mary to get contact requests")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await given.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const menuButton = page.locator("button[aria-label='main-menu']");
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    const chatsLink = page.getByRole("link", { name: "Chats" });
    await expect(chatsLink).toHaveCount(2);
    await chatsLink.first().click();

    // Then
    await expect(page.getByText("No contacts yet?")).toBeVisible();
    const chatsLinks = page.getByRole("link", { name: "Chats" });

    await expect(chatsLinks).toHaveCount(1);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate to image details", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments(); // do it twice

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    await page.goto("/images/5");
    await inputMarysPassword(page);

    // Then
    await expect(page.getByText(/No image found/)).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("navigate to devices and back on mobile resolution", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");
  await prepareMarysLogin(page);
  await prepareMarysDevices();
  await prepareMarysContactRequests();
  const provider = await prepareMarysDocuments();

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    const settingsLink = page.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    const devicesLink = page.getByRole("heading", { name: "Devices" });
    await expect(devicesLink).toBeVisible();
    await devicesLink.click();
    const deviceEntry = page.getByText(TestData.mary.devices[0].deviceId);
    await expect(deviceEntry).toBeVisible();
    const backButton = page.getByRole("button", { name: "back-button" });
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Then
    await expect(backButton).not.toBeVisible();
    await expect(deviceEntry).not.toBeVisible();
    await expect(devicesLink).toBeVisible();
    const mainMenu = page.getByRole("button", { name: "main-menu" });
    await expect(mainMenu).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
