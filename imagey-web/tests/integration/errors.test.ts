import * as fs from "fs";
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
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  // Mock 500 errors for contacts
  await page.route("**/users/mary*imagey.cloud/contacts", async (route) => {
    await route.fulfill({
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } else {
        await route.fulfill({
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    },
  );

  page.on("pageerror", (err) => console.log("Expected error:", err));

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  // Navigate to Chats
  const chatsLink = page.getByRole("link", { name: "Chats" }).first();
  await expect(chatsLink).toBeVisible();
  await chatsLink.click();

  // Trigger POST /contact-requests failure
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
    "**/users/mary@imagey.cloud/contact-requests",
  );
  await confirmButtonContact.click();
  await responsePromise;
});

test("load existing profile error handling", async ({ page }) => {
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
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  // Mock profile meta-data to exist
  await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documentId: "profile", name: "profile.json" }),
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });

  // Mock profile shared-key 500 error
  await page.route(
    "**/users/mary*imagey.cloud/documents/profile/encrypted-shared-keys/mary*imagey.cloud",
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

  // Go to settings
  const settingsLink = page.getByRole("link", { name: "Settings" });
  await expect(settingsLink).toBeVisible();
  await settingsLink.click();

  const responsePromise = page.waitForResponse(
    "**/users/mary@imagey.cloud/documents/profile/encrypted-shared-keys/mary*",
  );
  const profileLink = page
    .getByRole("heading", { name: "Profile", exact: true })
    .first();
  await expect(profileLink).toBeVisible();

  page.on("console", (msg) => {
    if (msg.text().includes("Failed to load profile")) {
      console.log("Caught expected profile load error");
    }
  });

  await profileLink.click();
  await responsePromise;

  // The page should still render the empty profile form, displaying the fallback user email
  await expect(page.getByText("mary@imagey.cloud")).toBeVisible();
});

test("public key loading error 500", async ({ page }) => {
  // Given
  await page.route(
    "**/users/mary*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  // When
  await page.goto("/?email=mary@imagey.cloud");

  // Then
  // It should show Unknown Authentication Error
  await expect(page.getByText(/Uknown Authentication Error/i)).toBeVisible();
});

test("manifest loading error fallback", async ({ page }) => {
  // Mock failure
  await page.route("/manifest.json", async (route) => {
    await route.abort("failed");
  });

  // Go to root
  await page.goto("/");

  // Verify that the fallback title ("Documents") is used
  await expect(page).toHaveTitle("Documents");
});

test("existing user fails to get challenge", async ({ page }) => {
  await page.route(
    "**/users/mary*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/challenges`,
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill("MarysPassword123");

  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByText("Wrong password")).toBeVisible();
});

test("existing user authentication rejected by server", async ({ page }) => {
  await page.route(
    "**/users/mary*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/challenges`,
    async (route) => {
      await route.fulfill({
        status: 201,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          ephemeralPublicKey: TestData.mary.publicMainKey,
          nonce: "some-random-nonce",
        },
      });
    },
  );

  await page.route(
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/authentications`,
    async (route) => {
      await route.fulfill({
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill("MarysPassword123");

  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByText("Wrong password")).toBeVisible();
});

test("existing user recovery key 500 error falls back to password dialog", async ({
  page,
}) => {
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
    `**/users/mary*imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
    async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );

  await setupMarysDevice(page);
  // Simulate having a stored recovery key
  await page.evaluate(
    (deviceId) =>
      localStorage.setItem(
        `imagey.devices[${deviceId}].recovery-key`,
        "mock-encrypted-key",
      ),
    TestData.mary.devices[0].deviceId,
  );

  await page.goto("/?email=mary@imagey.cloud");

  // Since recovery key failed with 500, it should fallback to password dialog
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
});

test("device activation error handling", async ({ page }) => {
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
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  // Mock finding devices to include a new unactivated device
  await page.route("**/users/mary*imagey.cloud/devices", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [TestData.mary.devices[0].deviceId, "new-unactivated-device"],
    });
  });

  // Mock fetching public key for new device
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

  // Mock activation failure
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
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      await route.fallback();
    }
  });

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Profile" }).first().click();

  await expect(page.getByText("mary@imagey.cloud")).toBeVisible();
});

test("profile save 500 error", async ({ page }) => {
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
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      await route.fallback();
    }
  });

  await setupMarysDevice(page);
  await page.goto("/?email=mary@imagey.cloud");
  await loginAsMary(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Profile" }).first().click();

  const editNameButton = page.locator("button:has(i:text('edit'))").first();
  await editNameButton.click();
  const nameInput = page.getByLabel("Name");
  await nameInput.fill("Mary Doe");

  const saveButton = page.getByRole("button", { name: "Save" });
  await saveButton.click();

  await expect(page.getByText("Mary Doe")).toBeVisible();
  await expect(saveButton).toBeEnabled();
});

test("send message missing location header", async ({ page }) => {
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
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  await page.route("**/users/mary*imagey.cloud/contacts", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: ["laura@imagey.cloud"],
    });
  });
  await page.route(
    "**/users/laura*imagey.cloud/public-keys/0",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: TestData.laura.publicMainKey,
      });
    },
  );
  await page.route(
    "**/users/mary*imagey.cloud/contacts/laura*imagey.cloud/key",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: TestData.mary.chats[0].encryptedSharedKey,
        },
      });
    },
  );
  await page.route(
    "**/users/mary*imagey.cloud/contacts/laura*imagey.cloud/messages*",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          json: [],
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
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

  await page.getByRole("link", { name: "Chats" }).first().click();
  await page.getByText("laura@imagey.cloud").first().click();

  const input = page.getByLabel("Type a message");
  await input.fill("This should fail due to missing location");
  await page.getByRole("button", { name: "send" }).click();

  await expect(input).toHaveValue("This should fail due to missing location");
});

test("profile picture load error", async ({ page }) => {
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
  await page.route(
    "**/users/mary*imagey.cloud/contact-requests",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: [],
      });
    },
  );
  await page.route("**/users/mary*imagey.cloud/documents", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: [],
    });
  });

  const profileMock = JSON.parse(
    fs.readFileSync("./tests/integration/profile_mock.json", "utf8"),
  );

  await page.route("**/users/mary*imagey.cloud/profile", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: profileMock,
      });
    } else {
      await route.fallback();
    }
  });

  await page.route(
    "**/users/mary*imagey.cloud/documents/profile/contents/profile",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: fs.readFileSync(
            "./tests/images/encrypted/profile/contents/profile",
          ),
        });
      } else {
        await route.fallback();
      }
    },
  );

  // Mock failure for the profile picture
  await page.route(
    "**/users/mary*imagey.cloud/documents/profile-pic-doc-id/encrypted-shared-keys/mary*imagey.cloud",
    async (route) => {
      if (route.request().method() === "GET") {
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
  await page.getByRole("heading", { name: "Profile" }).first().click();

  // Then: wait for profile data to appear, it should gracefully render Mary Doe without crashing
  await expect(page.getByText("Mary Doe")).toBeVisible();
});
