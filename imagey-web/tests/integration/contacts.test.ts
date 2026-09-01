import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysChatsDocument,
  setupMockServer,
  provider,
  prepareMarysContactRequests,
  runningPactRequests,
  prepareMarysEmptyContactRequests,
  TestData,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("wrong contact email", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  const builder = await prepareMarysEmptyDocumentsFolder();
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
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to send a contact request to alice")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        }).jsonBody({
          invitee: "alice@imagey.cloud",
          inviterEmail: "mary@imagey.cloud",
          publicKey: TestData.mary.publicMainKey,
        });
      },
    )
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

test("send contact request from the chats list without a known inviter email", async ({
  page,
}) => {
  // Given: same as "send contact request", but Mary's address was never stored
  // locally, so ChatsList sends inviterEmail: "".
  await prepareMarysLogin(page, false);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to send a contact request to alice from the chats list without inviter email",
    )
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        }).jsonBody({
          invitee: "alice@imagey.cloud",
          inviterEmail: "",
          publicKey: TestData.mary.publicMainKey,
        });
      },
    )
    .willRespondWith(201);

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByRole("button", { name: "add", exact: true }).click();

    const dialogHeading = page.getByRole("heading", { name: "Add Contact" });
    await expect(dialogHeading).toBeVisible();
    await page
      .getByPlaceholder("email@imagey.cloud")
      .fill("alice@imagey.cloud");
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(dialogHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("invite contact from empty panel", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);

  await prepareMarysChatsDocument([], "mary has no contacts");

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get contact requests returning empty")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const addContactInteraction = await prepareMarysEmptyDocumentsFolder();
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to send a contact request to alice from panel",
    )
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        }).jsonBody({
          invitee: "alice@imagey.cloud",
          inviterEmail: "mary@imagey.cloud",
          publicKey: TestData.mary.publicMainKey,
        });
      },
    )
    .willRespondWith(201);

  await addContactInteraction.executeTest(async (mockServer) => {
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
    page.on("pageerror", (err) =>
      console.log("BROWSER PAGEERROR:", err.message, err.stack),
    );
    await setupMockServer(page, mockServer);

    await loginAsMary(page);

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

test("invite from empty panel sends an empty inviter email when it is not known locally", async ({
  page,
}) => {
  // Given: Mary reached the logged-in state without her address ever being
  // stored (e.g. an auto-login on a device that only kept the userId), so the
  // request goes out with inviterEmail: "" - the mail just won't name her.
  await prepareMarysLogin(page, false);
  await prepareMarysChatsDocument([], "mary has no contacts");

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get contact requests returning empty (no local email)",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const addContactInteraction = await prepareMarysEmptyDocumentsFolder();
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to send a contact request without a known inviter email",
    )
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        }).jsonBody({
          invitee: "alice@imagey.cloud",
          inviterEmail: "",
          publicKey: TestData.mary.publicMainKey,
        });
      },
    )
    .willRespondWith(201);

  await addContactInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    const inviteButton = page.getByRole("button", {
      name: "person_add Invite Contact",
      exact: true,
    });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    const dialogHeading = page.getByRole("heading", { name: "Add Contact" });
    await expect(dialogHeading).toBeVisible();

    await page
      .getByPlaceholder("email@imagey.cloud")
      .fill("alice@imagey.cloud");
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(dialogHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("cancel invite contact from empty panel", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const provider = await prepareMarysEmptyContactRequests();

  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    const inviteButton = page.getByRole("button", {
      name: "person_add Invite Contact",
      exact: true,
    });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    const dialogHeading = page.getByRole("heading", { name: "Add Contact" });
    await expect(dialogHeading).toBeVisible();

    const cancelButton = page.getByRole("button", { name: "Cancel" });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(dialogHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
