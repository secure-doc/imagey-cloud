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
  prepareMarysDocuments,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get lauras public key")
    .withRequest("GET", "/users/laura@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.laura.publicMainKey));

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to accept lauras invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // We don't exact-match the encrypted key because it changes dynamically
        r.jsonBody({
          key: MatchersV3.like("dummy-encrypted-key"),
          invitationKey: MatchersV3.like("dummy-encrypted-key"),
        });
      },
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

    await expect(invitationPanel).toContainText("laura@imagey.cloud");

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
  await prepareMarysDocuments();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to decline lauras invitation")
    .withRequest(
      "DELETE",
      "/users/mary@imagey.cloud/contact-requests/laura@imagey.cloud",
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

    await expect(invitationPanel).toContainText("laura@imagey.cloud");

    // Act: Decline Alice
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send contact request", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
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
