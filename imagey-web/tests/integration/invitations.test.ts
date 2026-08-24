import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import {
  clearLocalStorage,
  generateAesGcmKeyJwk,
  loginAsMary,
  prepareMarysChatCreation,
  prepareMarysChatsDocument,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
  prepareMarysEmptyContactRequests,
  prepareMarysEmptyDocumentsFolder,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  // Accepting re-reads the "chats" document a second time (see
  // ContactService.acceptContactRequest) - use the SAME key for both
  // registered reads below so it doesn't matter which of the two
  // identical-looking interactions the mock server matches which request
  // against.
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  await prepareMarysContactRequests(chatsDocumentKey);

  // No fetch of bill's public key is needed here - it was already sent
  // along with the ContactRequest itself (see
  // ContactService.acceptContactRequest).
  const builder = provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to accept bills invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contact-requests/bill@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // We don't exact-match the encrypted key/chatId because they're
        // generated dynamically (see ContactService.acceptContactRequest).
        r.jsonBody({
          inviter: "bill@imagey.cloud",
          invitee: "mary@imagey.cloud",
          status: "ACCEPTED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
          chatId: MatchersV3.string("new-chat-id"),
          sharedKey: MatchersV3.string("dummy-encrypted-key"),
        });
      },
    )
    .willRespondWith(204);

  // Accepting now also creates the chat's own Document: it re-reads the
  // "chats" document (a second GET, distinct from the one the initial
  // page load already consumed via prepareMarysContactRequests() above)
  // and then uploads the new chat Document, same shape as creating a folder.
  await prepareMarysChatsDocument(
    [],
    "mary has no contacts and a contact request from bill",
    chatsDocumentKey,
  );
  await prepareMarysChatCreation();

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
  await prepareMarysEmptyDocumentsFolder();
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
  await prepareMarysEmptyDocumentsFolder();
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const builder = await prepareMarysContactRequests(chatsDocumentKey);

  // Accepting re-reads the "chats" document and creates the chat's own
  // Document before it ever reaches the (overridden-to-fail) PUT below -
  // both need to be mocked so the flow actually gets there.
  await prepareMarysChatsDocument(
    [],
    "mary has no contacts and a contact request from bill",
    chatsDocumentKey,
  );
  await prepareMarysChatCreation();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the PUT request with Playwright's page.route to return 500
    // so we don't pollute the Pact contract!
    let acceptPutAttempted = false;
    await page.route(
      "**/users/mary@imagey.cloud/contact-requests/bill@imagey.cloud",
      async (route) => {
        if (route.request().method() === "PUT") {
          acceptPutAttempted = true;
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
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptAliceBtn.click();

    // The failure path leaves the panel visible, so there's no UI change to
    // wait on. Gate the callback's return on the failing PUT actually being
    // reached: it's the last call in the accept flow, so by the time it
    // fires the preceding chats re-read + chat-document upload have already
    // completed against the Pact mock server - without this, executeTest can
    // tear the mock server down while one of those is still in flight
    // ("route.fetch: connect ECONNREFUSED" / "request expected but not
    // received").
    await expect.poll(() => acceptPutAttempted).toBe(true);

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decline open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const builder = await prepareMarysContactRequests();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the DELETE request with Playwright's page.route to return 500
    let declineDeleteAttempted = false;
    await page.route(
      "**/users/mary@imagey.cloud/contact-requests/bill@imagey.cloud",
      async (route) => {
        if (route.request().method() === "DELETE") {
          declineDeleteAttempted = true;
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
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();

    // The failure path leaves the panel visible, so gate on the failing
    // DELETE actually being reached before letting executeTest tear the
    // mock server down (see the accept-fails test above).
    await expect.poll(() => declineDeleteAttempted).toBe(true);

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send contact request", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysEmptyContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to send an invitation to bill")
    .withRequest("POST", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        "Content-Type": "application/json",
      });
      r.jsonBody({
        inviter: "mary@imagey.cloud",
        invitee: "bill@imagey.cloud",
        publicKey: MatchersV3.like(TestData.mary.publicMainKey),
      });
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
