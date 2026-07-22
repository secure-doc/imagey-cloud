import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
  prepareMarysEmptyContactRequests,
  prepareEmptyMarysDocuments,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();
  await prepareMarysContactRequests();

  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to get bills public key")
    .withRequest("GET", "/users/bill@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.bill.publicMainKey));

  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to accept bills invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/bill@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "text/plain",
        });
      },
    )
    .willRespondWith(204);

  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request to create the chat document for bill")
    .withRequest(
      "PUT",
      MatchersV3.regex(
        "\\/users\\/mary@imagey\\.cloud\\/documents\\/[a-f0-9\\-]+",
        "/users/mary@imagey.cloud/documents/e5b33d75-00c7-4e9f-a332-0a296ab84c93",
      ),
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request to upload marys key for the chat")
    .withRequest(
      "PUT",
      MatchersV3.regex(
        "\\/users\\/mary@imagey\\.cloud\\/documents\\/[a-f0-9\\-]+\\/keys\\/mary@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/e5b33d75-00c7-4e9f-a332-0a296ab84c93/keys/mary@imagey.cloud",
      ),
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({ sharedKey: MatchersV3.string("AAAA") });
      },
    )
    .willRespondWith(200);

  const builder = provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request to upload bills key for the chat")
    .withRequest(
      "PUT",
      MatchersV3.regex(
        "\\/users\\/mary@imagey\\.cloud\\/documents\\/[a-f0-9\\-]+\\/keys\\/bill@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/e5b33d75-00c7-4e9f-a332-0a296ab84c93/keys/bill@imagey.cloud",
      ),
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({ sharedKey: MatchersV3.string("AAAA") });
      },
    )
    .willRespondWith(200);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    await expect(invitationPanel).toContainText("bill@imagey.cloud");

    // Act: Accept Alice
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decline open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to decline bills invitation")
    .withRequest(
      "DELETE",
      "/users/mary@imagey.cloud/contact-requests/bill@imagey.cloud",
    )
    .willRespondWith(204);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    await expect(invitationPanel).toContainText("bill@imagey.cloud");

    // Act: Decline Alice
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("accept open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();
  await prepareMarysContactRequests();

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get bills public key (fail case)")
    .withRequest("GET", "/users/bill@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.bill.publicMainKey));

  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request to create the chat document for bill (fail case)")
    .withRequest(
      "PUT",
      MatchersV3.regex(
        "\\/users\\/mary@imagey\\.cloud\\/documents\\/[a-f0-9\\-]+",
        "/users/mary@imagey.cloud/documents/e5b33d75-00c7-4e9f-a332-0a296ab84c93",
      ),
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request to upload marys key for the chat (fail case)")
    .withRequest(
      "PUT",
      MatchersV3.regex(
        "\\/users\\/mary@imagey\\.cloud\\/documents\\/[a-f0-9\\-]+\\/keys\\/mary@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/e5b33d75-00c7-4e9f-a332-0a296ab84c93/keys/mary@imagey.cloud",
      ),
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({ sharedKey: MatchersV3.string("AAAA") });
      },
    )
    .willRespondWith(200);

  const builder = provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request to upload bills key for the chat (fail case)")
    .withRequest(
      "PUT",
      MatchersV3.regex(
        "\\/users\\/mary@imagey\\.cloud\\/documents\\/[a-f0-9\\-]+\\/keys\\/bill@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/e5b33d75-00c7-4e9f-a332-0a296ab84c93/keys/bill@imagey.cloud",
      ),
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({ sharedKey: MatchersV3.string("AAAA") });
      },
    )
    .willRespondWith(200);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the PUT request with Playwright's page.route to return 500
    // so we don't pollute the Pact contract!
    await page.route(
      "**/users/mary@imagey.cloud/contacts/bill@imagey.cloud",
      async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);

    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    // Act: Accept Alice
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/contacts/") && r.status() === 500,
    );
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptAliceBtn.click();
    await responsePromise;

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decline open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();
  const builder = await prepareMarysContactRequests();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the DELETE request with Playwright's page.route to return 500
    await page.route(
      "**/users/mary@imagey.cloud/contact-requests/bill@imagey.cloud",
      async (route) => {
        if (route.request().method() === "DELETE") {
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);

    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    // Act: Decline Alice
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/contact-requests/") && r.status() === 500,
    );
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await responsePromise;

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send contact request", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();
  await prepareMarysEmptyContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to send an invitation to bill")
    .withRequest("POST", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        "Content-Type": "application/json",
      });
      r.jsonBody({ email: "bill@imagey.cloud" });
    })
    .willRespondWith(201);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Act: Navigate to chats
    await page.getByRole("link", { name: "Chats" }).click();

    // Act: Click add contact in NoContactsPanel
    await page.getByRole("button", { name: "Invite Contact" }).click();

    // Enter email in dialog
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();
    await emailInput.fill("bill@imagey.cloud");

    // Submit dialog
    await page.getByRole("button", { name: "Confirm" }).click();

    // Assert: dialog is closed
    await expect(emailInput).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
