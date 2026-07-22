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
    .uponReceiving(
      "a request to create the chat document for bill in chats test",
    )
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
    .uponReceiving("a request to upload marys key for the chat in chats test")
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
    .uponReceiving("a request to upload bills key for the chat in chats test")
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
