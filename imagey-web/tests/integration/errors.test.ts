import * as fs from "fs";
import * as path from "path";
import { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  setupMarysDevice,
  setupBillsDevice,
  TestData,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

async function mockMarysBackend(page: Page) {
  // Public keys
  await page.route(
    "**/users/mary*imagey.cloud/public-keys/0",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.mary.publicMainKey,
      });
    },
  );
  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.mary.devices[0].publicDeviceKey,
      });
    },
  );
  // Private keys
  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          kid: "0",
          encryptingDeviceId: TestData.mary.devices[0].deviceId,
          key: TestData.mary.devices[0].encryptedPrivateMainKey,
        },
      });
    },
  );
  // Documents without folderId
  await page.route(
    (url) =>
      url.pathname === "/users/mary@imagey.cloud/documents" &&
      !url.searchParams.has("folderId"),
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [{ documentId: "root-folder-id" }],
      });
    },
  );
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  // Profile Doc
  await page.route(
    "**/users/mary*imagey.cloud/documents/mary@imagey.cloud",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          documentId: "mary@imagey.cloud",
          metadata: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/mary@imagey.cloud/metadata",
            ),
            "base64",
          ),
          sharedKey: {
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey: fs.readFileSync(
              path.resolve(
                process.cwd(),
                "tests/images/encrypted/mary@imagey.cloud/keys/mary@imagey.cloud/encrypted-shared.key",
              ),
              "base64",
            ),
          },
        },
      });
    },
  );
  // Root Folder
  await page.route(
    "**/users/mary*imagey.cloud/documents/root-folder-id",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          documentId: "root-folder-id",
          metadata: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/root-folder-id/metadata",
            ),
            "base64",
          ),
          sharedKey: {
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey: fs.readFileSync(
              path.resolve(
                process.cwd(),
                "tests/images/encrypted/root-folder-id/keys/mary@imagey.cloud/encrypted-shared.key",
              ),
              "base64",
            ),
          },
        },
      });
    },
  );
  // Documents List
  await page.route(
    "**/users/mary*imagey.cloud/documents?folderId=*",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [
          {
            documentId: "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
            metadata:
              "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
            sharedKey: {
              issuerType: "FOLDER",
              issuer: "root-folder-id",
              kid: "0",
              sharedKey: fs.readFileSync(
                path.resolve(
                  process.cwd(),
                  "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/root-folder-id/encrypted-shared.key",
                ),
                "base64",
              ),
            },
          },
        ],
      });
    },
  );
}

test("document loading error", async ({ page }) => {
  await mockMarysBackend(page);
  // Override specific document file to return 500
  await page.route(
    "**/users/mary*imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/*",
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  await expect(page.getByText(/Error loading/)).toBeVisible({ timeout: 10000 });
});

test("private key loading error", async ({ page }) => {
  await page.route(
    "**/users/bill*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.bill.publicMainKey,
      });
    },
  );
  await page.route(
    `**/users/bill*imagey.cloud/devices/${TestData.bill.devices[0].deviceId}/private-keys/0`,
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupBillsDevice(page);
  await page.goto("/?email=bill@imagey.cloud");

  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.bill.password);

  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await confirmButton.click();
  await expect(page.getByText("Wrong password")).toBeVisible();
});

test("contact repository error handling", async ({ page }) => {
  await mockMarysBackend(page);
  // Mock 500 errors for contacts
  await page.route(
    (url) =>
      url.pathname === "/users/mary@imagey.cloud/documents" &&
      !url.searchParams.has("folderId"),
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  const chatsLink = page.getByRole("link", { name: "Chats" }).first();
  await expect(chatsLink).toBeVisible();
  await chatsLink.click();

  const addContactButton = page.getByRole("button", {
    name: "add",
    exact: true,
  });
  await expect(addContactButton).toBeVisible();
  await addContactButton.click();

  const emailInput = page.getByPlaceholder("email@imagey.cloud");
  await expect(emailInput).toBeVisible();
  await emailInput.fill("alice@imagey.cloud");

  const confirmButtonContact = page.getByRole("button", { name: "Confirm" });
  await expect(confirmButtonContact).toBeVisible();
  const responsePromise = page.waitForResponse(
    "**/users/mary*imagey.cloud/contact-requests",
  );
  await confirmButtonContact.click();
  await responsePromise;
});

test("load existing profile error handling", async ({ page }) => {
  await mockMarysBackend(page);
  // The profile endpoint is /users/mary@imagey.cloud/profile in the backend, wait, actually
  // setup.ts mocks GET /users/mary@imagey.cloud/profile returning 404 so it fetches /documents/mary@imagey.cloud
  // Wait, no. The backend HAS an endpoint for /profile which returns {documentId, name}.
  // We'll mock that to point to a "profile" document.
  await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documentId: "profile", name: "profile.json" }),
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  // Then mock 500 when it fetches that profile doc's keys or the doc itself.
  await page.route(
    "**/users/mary*imagey.cloud/documents/profile",
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  const settingsLink = page.getByRole("link", { name: "Settings" });
  await expect(settingsLink).toBeVisible();
  await settingsLink.click();

  const profileLink = page
    .getByRole("heading", { name: "Profile", exact: true })
    .first();
  await expect(profileLink).toBeVisible();
  await profileLink.click();

  // Should fallback gracefully
  await expect(page.getByText("mary@imagey.cloud")).toBeVisible();
});

test("public key loading error 500", async ({ page }) => {
  await setupMarysDevice(page);
  await page.route(
    "**/users/mary*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.goto("/?email=mary@imagey.cloud");
  await expect(page.getByText(/Uknown Authentication Error/i)).toBeVisible();
});

test("manifest loading error fallback", async ({ page }) => {
  await page.route("/manifest.json", async (route) => {
    await route.abort("failed");
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Documents");
});

test("registration 500 error", async ({ page }) => {
  await page.route(
    "**/users/mary@imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route("**/users/", async (route) => {
    await route.fulfill({
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });

  await page.goto("/?email=mary@imagey.cloud");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await passwordInput.fill(TestData.mary.password);
  await page.getByLabel("Confirm Password").fill(TestData.mary.password);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(
    page.getByText("An error occurred during authentication"),
  ).toBeVisible();
});

test("authentication 503 error", async ({ page }) => {
  await page.route(
    "**/users/mary@imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route(
    "**/users/mary@imagey.cloud/verifications/",
    async (route) => {
      await route.fulfill({
        status: 503,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await page.goto("/?email=mary@imagey.cloud");
  await expect(
    page.getByText("Mail server is currently unavailable"),
  ).toBeVisible();
});

test("authentication 403 error", async ({ page }) => {
  await page.route(
    "**/users/mary@imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route(
    "**/users/mary@imagey.cloud/verifications/",
    async (route) => {
      await route.fulfill({
        status: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await page.goto("/?email=mary@imagey.cloud");
  await expect(
    page.getByText("An error occurred during authentication"),
  ).toBeVisible();
});

test("device activation error handling", async ({ page }) => {
  await mockMarysBackend(page);

  await page.route("**/users/mary*imagey.cloud/devices", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [TestData.mary.devices[0].deviceId, "new-unactivated-device"],
    });
  });
  await page.route(
    "**/users/mary*imagey.cloud/devices/new-unactivated-device/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.mary.devices[1].publicDeviceKey,
      });
    },
  );
  await page.route(
    "**/users/mary*imagey.cloud/devices/new-unactivated-device/private-keys/",
    async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } else {
        await route.fallback();
      }
    },
  );

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Devices" }).click();
  await page.getByText("new-unactivated-device").first().click();
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByText("Error activating device")).toBeVisible({
    timeout: 5000,
  });
});

test("profile load 500 error", async ({ page }) => {
  await mockMarysBackend(page);

  await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
    await route.fulfill({
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  const settingsLink = page.getByRole("link", { name: "Settings" });
  await expect(settingsLink).toBeVisible();
  await settingsLink.click();
  const profileLink = page
    .getByRole("heading", { name: "Profile", exact: true })
    .first();
  await expect(profileLink).toBeVisible();
  await profileLink.click();

  await expect(page.getByText("mary@imagey.cloud")).toBeVisible();
});
