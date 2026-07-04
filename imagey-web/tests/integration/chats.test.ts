import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysDocuments,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate to chats", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const builder = await prepareMarysContactRequests();
  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Then
    await expect(
      page.getByRole("heading", {
        name: "bill@imagey.cloud",
      }),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
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

  const builder = provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to accept bills invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/bill@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // We don't exact-match the encrypted key because it changes dynamically
        r.jsonBody({
          userKey: MatchersV3.like({
            issuerType: "USER",
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey: "dummy-encrypted-key",
          }),
          contactKey: MatchersV3.like({
            issuerType: "USER",
            issuer: "bill@imagey.cloud",
            kid: "0",
            sharedKey: "dummy-encrypted-key",
          }),
        });
      },
    )
    .willRespondWith(204);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(
      page
        .getByRole("heading", {
          name: "Contact Request",
        })
        .locator(".."),
    ).toBeVisible();

    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "bill@imagey.cloud",
      })
      .locator("../..");
    await expect(invitationPanel).toBeVisible();
    await expect(invitationPanel).toContainText("bill@imagey.cloud");

    // Act: Accept Laura
    const acceptLauraBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptLauraBtn.click();
    await expect(acceptLauraBtn).not.toBeVisible();
    const contactPanel = invitationPanel;
    await expect(contactPanel).toBeVisible();
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
    await expect(
      page
        .getByRole("heading", {
          name: "Contact Request",
        })
        .locator(".."),
    ).toBeVisible();

    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "bill@imagey.cloud",
      })
      .locator("../..");
    await expect(invitationPanel).toBeVisible();
    await expect(invitationPanel).toContainText("bill@imagey.cloud");

    // Act: Decline Laura
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
