import fs from "fs";
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

test("document loading error", async ({ page }) => {
  page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  page.on("requestfailed", (req) =>
    console.log("REQUEST FAILED:", req.url(), req.failure()?.errorText),
  );
  page.on("response", (res) =>
    console.log("RESPONSE:", res.url(), res.status()),
  );

  // Mock login endpoints
  await page.route(
    "**/users/mary*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.mary.publicMainKey,
      });
    },
  );
  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.mary.devices[0].publicDeviceKey,
      });
    },
  );
  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
    async (route) => {
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

  // Mock contact requests
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: ["laura@imagey.cloud"],
      });
    },
  );

  // Mock documents
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [
        {
          documentId: "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
          encryptedData:
            "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
          sharedKey: fs.readFileSync(
            "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/shared-keys/mary@imagey.cloud/encrypted-shared.key",
            "utf8",
          ),
        },
      ],
    });
  });

  // Mock document content failure
  await page.route(
    "**/users/mary*imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/contents/*",
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

  await expect(
    page.getByText(/Error loading Encrypted Document/),
  ).toBeVisible();
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

  const passwordInput = page.getByLabel("password");
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.bill.password);

  const confirmButton = page.getByText("Confirm");
  await confirmButton.click();
  await expect(page.getByText("Wrong password")).toBeVisible();
});
