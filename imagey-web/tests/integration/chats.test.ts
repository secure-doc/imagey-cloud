import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  generateAesGcmKeyJwk,
  loginAsMary,
  prepareMarysChatCreation,
  prepareMarysChatsDocument,
  prepareMarysDocuments,
  prepareMarysLogin,
  setupMockServer,
  provider,
  prepareMarysAcceptedContactRequest,
  prepareMarysNamedPublicProfile,
  prepareMarysPublicProfileShare,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("pick up an accepted invitation again after a failed confirm reuses the chat", async ({
  page,
}) => {
  // A previous pick-up already created the chat Document (together with
  // bill's contact entry), but confirming receipt failed. The retry must not
  // create the chat a second time - it only re-shares mary's public profile
  // and confirms receipt.
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  const given = "mary has created the chat with bill but not confirmed receipt";
  const chatId = "chat-bill-for-mary-retry";
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const contacts = [
    {
      userId: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      chatId,
      owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
    },
  ];

  await prepareMarysAcceptedContactRequest(
    chatId,
    given,
    chatsDocumentKey,
    contacts,
  );
  await prepareMarysChatsDocument(contacts, given, chatsDocumentKey);
  const { publicProfileId } = await prepareMarysNamedPublicProfile(
    "Mary",
    given,
  );
  prepareMarysPublicProfileShare(
    publicProfileId,
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
    given,
  );

  const builder = provider
    .addInteraction()
    .given(given)
    .uponReceiving(
      "a request of mary to confirm receipt of bills contact on retry",
    )
    .withRequest(
      "PUT",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({
          inviter: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          invitee: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          status: "RECEIVED",
        });
      },
    )
    .willRespondWith(204);

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.locator("main img")).toHaveCount(2);

    const confirmed = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/contact-requests/"),
    );
    await page.getByRole("link", { name: "Chats" }).first().click();
    await confirmed;

    // Still exactly one entry for bill.
    await expect(page.getByText("Bill", { exact: true })).toHaveCount(1);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("pick up an accepted invitation fails when confirming receipt fails", async ({
  page,
}) => {
  // Same as "pick up an accepted invitation (inviter side)" above, but the
  // final confirm-receipt PUT fails - covers ContactRepository.
  // confirmContactRequestReceived's failure branch and confirms the flow
  // just logs (leaving the request actionable for a retry) rather than
  // crashing.
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  const given =
    "mary has no contacts and bill has accepted marys invitation for a failing confirm";
  const chatId = "chat-bill-for-mary-failing-confirm";
  const chatsDocumentKey = await generateAesGcmKeyJwk();

  await prepareMarysAcceptedContactRequest(chatId, given, chatsDocumentKey);
  await prepareMarysChatsDocument([], given, chatsDocumentKey);
  const { publicProfileId } = await prepareMarysNamedPublicProfile(
    "Mary",
    given,
  );
  prepareMarysPublicProfileShare(
    publicProfileId,
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
    given,
  );

  const builder = await prepareMarysChatCreation(
    chatId,
    given,
    "a request of mary to create a chat document before a failing confirm",
  );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    let confirmPutAttempted = false;
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      async (route, request) => {
        if (request.method() === "PUT") {
          confirmPutAttempted = true;
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);
    await expect(page.locator("main img")).toHaveCount(2);

    await page.getByRole("link", { name: "Chats" }).first().click();

    // receiveContactRequest only reports the contact once every step -
    // including the confirm-receipt PUT - has succeeded, so a failure here
    // leaves the request actionable for a retry rather than adding bill
    // optimistically. Gate on the failing PUT actually being reached.
    await expect.poll(() => confirmPutAttempted).toBe(true);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
