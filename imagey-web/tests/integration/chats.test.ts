import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysDocuments,
  prepareMarysLogin,
  prepareMarysContacts,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("navigate to chats", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();
  const builder = await prepareMarysContacts();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    chatsLink.click();

    // Then
    await expect(
      page.getByRole("heading", {
        name: "laura@imagey.cloud",
      }),
    ).toBeVisible();
  });
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();
  await prepareMarysContacts();

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
    chatsLink.click();

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "laura@imagey.cloud",
      })
      .locator("../..");
    await expect(invitationPanel).toBeVisible();
    await expect(invitationPanel).toContainText("laura@imagey.cloud");

    // Act: Accept Laura
    const acceptLauraBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptLauraBtn.click();
    await expect(acceptLauraBtn).not.toBeVisible();
    const contactPanel = invitationPanel;
    await expect(contactPanel).toBeVisible();
  });
});

test("decline open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();
  await prepareMarysContacts();

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
    await expect(
      page
        .getByRole("heading", {
          name: "Contact Request",
        })
        .locator(".."),
    ).toBeVisible();

    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    chatsLink.click();

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "laura@imagey.cloud",
      })
      .locator("../..");
    await expect(invitationPanel).toBeVisible();
    await expect(invitationPanel).toContainText("laura@imagey.cloud");

    // Act: Decline Laura
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
  });
});
