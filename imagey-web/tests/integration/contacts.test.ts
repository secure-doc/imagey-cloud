import { MatchersV3 } from "@pact-foundation/pact";
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
  prepareMarysNamedPublicProfile,
  prepareMarysProfileWithoutPublicProfile,
  prepareMarysPublicProfileCreation,
  prepareMarysPublicProfileMetadataPut,
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
  // Sending a request first ensures mary has a named public profile of her
  // own (§3.6) - she already has one here, so this is a read, not a
  // create/prompt.
  const { publicProfileId } = await prepareMarysNamedPublicProfile();

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
          publicProfileId,
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
    // Sending now chains several requests (ensuring mary's public profile,
    // see §3.6) before the actual POST - runningPactRequests can dip back to
    // 0 momentarily *between* those, so wait for the POST itself rather than
    // relying on the poll below alone (see memory
    // imagey-web-runningpactrequests-race).
    const contactRequestPosted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/contact-requests"),
    );
    await confirmButton.click();
    await contactRequestPosted;

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
  const { publicProfileId } = await prepareMarysNamedPublicProfile();

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
          publicProfileId,
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
    // See the "send contact request" test above re: waiting for the POST
    // itself rather than the runningPactRequests poll alone.
    const contactRequestPosted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/contact-requests"),
    );
    await page.getByRole("button", { name: "Confirm" }).click();
    await contactRequestPosted;

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
  const { publicProfileId } = await prepareMarysNamedPublicProfile();
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
          publicProfileId,
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
    // See the "send contact request" test above re: waiting for the POST
    // itself rather than the runningPactRequests poll alone.
    const contactRequestPosted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/contact-requests"),
    );
    await confirmButton.click();
    await contactRequestPosted;

    // Then the dialog should close
    await expect(dialogHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
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
  const { publicProfileId } = await prepareMarysNamedPublicProfile();
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
          publicProfileId,
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
    // See the "send contact request" test above re: waiting for the POST
    // itself rather than the runningPactRequests poll alone.
    const contactRequestPosted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/contact-requests"),
    );
    await page.getByRole("button", { name: "Confirm" }).click();
    await contactRequestPosted;

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

test("send contact request prompts for a display name when mary has no public profile yet", async ({
  page,
}) => {
  // Given: mary's private profile exists but has no publicProfileId yet
  // (§3.5) - sending a request must ask for a name before it can go out.
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysContactRequests();
  await prepareMarysProfileWithoutPublicProfile();
  await prepareMarysPublicProfileCreation();
  prepareMarysPublicProfileMetadataPut();

  const builder = provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to send a contact request to alice after naming her public profile",
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
          // The public profile is freshly created in this test, so its id is
          // client-generated - only its shape is asserted.
          publicProfileId: MatchersV3.string("new-public-profile-id"),
        });
      },
    )
    .willRespondWith(201);

  await builder.executeTest(async (mockServer) => {
    // When
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

    // The "Add Contact" dialog closes and a name prompt takes its place.
    await expect(dialogHeading).not.toBeVisible();
    const namePromptHeading = page.getByRole("heading", {
      name: "How should others see you?",
    });
    await expect(namePromptHeading).toBeVisible();

    // Confirming with no name shows a validation error instead of sending.
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Please enter a name.")).toBeVisible();

    await page.getByLabel("Name").fill("Mary Doe");
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(namePromptHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("cancel the display-name prompt when sending a contact request", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const builder = await prepareMarysContactRequests();
  await prepareMarysProfileWithoutPublicProfile();
  await prepareMarysPublicProfileCreation();

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

    const namePromptHeading = page.getByRole("heading", {
      name: "How should others see you?",
    });
    await expect(namePromptHeading).toBeVisible();

    // Cancelling must not send the contact request (Pact would fail on an
    // unexpected POST, since none is registered for this test).
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(namePromptHeading).not.toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send contact request fails gracefully when the POST fails", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const builder = await prepareMarysContactRequests();
  await prepareMarysNamedPublicProfile();

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    let postAttempted = false;
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      async (route, request) => {
        if (request.method() === "POST") {
          postAttempted = true;
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);
    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByRole("button", { name: "add", exact: true }).click();
    await page
      .getByPlaceholder("email@imagey.cloud")
      .fill("alice@imagey.cloud");
    await page.getByRole("button", { name: "Confirm" }).click();

    // The failing POST is caught and logged (contactService.sendContactRequest
    // throws, useSendContactRequest.requestContact's catch swallows it) -
    // gate on the POST actually being reached before tearing the mock server
    // down.
    await expect.poll(() => postAttempted).toBe(true);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("invite from empty panel prompts for a display name when mary has no public profile yet", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysChatsDocument([], "mary has no contacts");
  provider
    .addInteraction()
    .given("mary has no contacts")
    .uponReceiving(
      "a request of mary to get empty contact requests before naming her public profile",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
  await prepareMarysProfileWithoutPublicProfile();
  await prepareMarysPublicProfileCreation();
  prepareMarysPublicProfileMetadataPut();

  const builder = provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to send a contact request to alice from panel after naming her public profile",
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
          publicProfileId: MatchersV3.string("new-public-profile-id"),
        });
      },
    )
    .willRespondWith(201);

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    const inviteButton = page.getByRole("button", {
      name: "person_add Invite Contact",
      exact: true,
    });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    await page
      .getByPlaceholder("email@imagey.cloud")
      .fill("alice@imagey.cloud");
    await page.getByRole("button", { name: "Confirm" }).click();

    const namePromptHeading = page.getByRole("heading", {
      name: "How should others see you?",
    });
    await expect(namePromptHeading).toBeVisible();

    const contactRequestPosted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/contact-requests"),
    );
    await page.getByLabel("Name").fill("Mary Doe");
    await page.getByRole("button", { name: "Confirm" }).click();
    await contactRequestPosted;

    await expect(namePromptHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
