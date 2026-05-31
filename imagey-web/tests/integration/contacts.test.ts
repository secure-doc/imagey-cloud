import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  loginAsBill,
  prepareMarysLogin,
  prepareBillsLogin,
  prepareMarysDocuments,
  setupMockServer,
  provider,
  prepareMarysContactRequests,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("wrong contact email", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  const builder = await prepareMarysDocuments();
  await prepareMarysContactRequests();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Navigate to Chats
    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Click the add contact button
    const addContactButton = page.getByRole("button", {
      name: "add",
      exact: true,
    });
    await expect(addContactButton).toBeVisible();
    await addContactButton.click();

    // The dialog should appear
    const dialogHeading = page.getByRole("heading", { name: "Add Contact" });
    await expect(dialogHeading).toBeVisible();

    // Fill in the email
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("alice(at)imagey.cloud");
    await expect(
      page.getByText("Please enter a valid email address."),
    ).toBeVisible();

    // Click confirm
    const confirmButton = page.getByRole("button", { name: "Confirm" });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Then the dialog should close
    await expect(
      page.getByText("Please enter a valid email address."),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send contact request", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to send a contact request to alice")
    .withRequest("POST", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        "Content-Type": "application/json",
      }).jsonBody({ email: "alice@imagey.cloud" });
    })
    .willRespondWith(201);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Navigate to Chats
    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Click the add contact button
    const addContactButton = page.getByRole("button", {
      name: "add",
      exact: true,
    });
    await expect(addContactButton).toBeVisible();
    await addContactButton.click();

    // The dialog should appear
    const dialogHeading = page.getByRole("heading", { name: "Add Contact" });
    await expect(dialogHeading).toBeVisible();

    // Fill in the email
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("alice@imagey.cloud");

    // Click confirm
    const confirmButton = page.getByRole("button", { name: "Confirm" });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Then the dialog should close
    await expect(dialogHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("invite contact from empty panel", async ({ page }) => {
  // Given
  await prepareBillsLogin(page);

  provider
    .addInteraction()
    .uponReceiving("a request of bill to get contacts returning empty")
    .withRequest("GET", "/users/bill@imagey.cloud/contacts", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  provider
    .addInteraction()
    .uponReceiving("a request of bill to get contact requests returning empty")
    .withRequest("GET", "/users/bill@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  provider
    .addInteraction()
    .uponReceiving("a request of bill to get his documents returning empty")
    .withRequest("GET", "/users/bill@imagey.cloud/documents", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const addContactInteraction = provider
    .addInteraction()
    .uponReceiving(
      "a request of bill to send a contact request to alice from panel",
    )
    .withRequest("POST", "/users/bill@imagey.cloud/contact-requests", (r) => {
      r.headers({
        "Content-Type": "application/json",
      }).jsonBody({ email: "alice@imagey.cloud" });
    })
    .willRespondWith(201);

  await addContactInteraction.executeTest(async (mockServer) => {
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
    page.on("pageerror", (err) =>
      console.log("BROWSER PAGEERROR:", err.message, err.stack),
    );
    await setupMockServer(page, mockServer);

    // Override contacts to return empty directly instead of using setup.ts's default
    await page.route("**/users/bill*imagey.cloud/contacts", async (route) => {
      if (route.request().method() === "GET") {
        const response = await route.fetch({
          url: mockServer.url + "/users/bill@imagey.cloud/contacts",
        });
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });

    await page.route("**/users/bill*imagey.cloud/documents", async (route) => {
      if (route.request().method() === "GET") {
        const response = await route.fetch({
          url: mockServer.url + "/users/bill@imagey.cloud/documents",
        });
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });

    await page.route(
      "**/users/bill*imagey.cloud/contact-requests",
      async (route) => {
        if (
          route.request().method() === "GET" &&
          route.request().postData() === null
        ) {
          const response = await route.fetch({
            url: mockServer.url + "/users/bill@imagey.cloud/contact-requests",
          });
          await route.fulfill({ response });
        } else if (route.request().method() === "POST") {
          const response = await route.fetch({
            url: mockServer.url + "/users/bill@imagey.cloud/contact-requests",
            method: "POST",
            postData: route.request().postData() ?? "",
            headers: route.request().headers(),
          });
          await route.fulfill({ response });
        } else {
          await route.continue();
        }
      },
    );

    await loginAsBill(page);

    // The NoContactsPanel should be visible because we have no contacts and no invitations
    const inviteButton = page.getByRole("button", {
      name: "person_add Invite Contact",
      exact: true,
    });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    // The dialog should appear
    const dialogHeading = page.getByRole("heading", { name: "Add Contact" });
    await expect(dialogHeading).toBeVisible();

    // Fill in the email
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("alice@imagey.cloud");

    // Click confirm
    const confirmButton = page.getByRole("button", { name: "Confirm" });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Then the dialog should close
    await expect(dialogHeading).not.toBeVisible();
  });
});
