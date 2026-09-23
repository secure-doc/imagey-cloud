import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  generateAesGcmKeyJwk,
  loginAsMary,
  prepareMarysChatCreation,
  prepareMarysChatsDocumentUpdate,
  prepareMarysChatsDocument,
  prepareMarysDocuments,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
  prepareMarysAcceptedContactRequest,
  prepareMarysNamedPublicProfile,
  prepareMarysPublicProfileShare,
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

    // The "bill@imagey.cloud" heading below comes from the (un-awaited)
    // contact-requests fetch, which resolves well before the "chats"
    // document load does. Its key GET is the last request of that load, and
    // runningPactRequests briefly dips to 0 between the content GET and the
    // key GET - so without waiting for this response explicitly, the poll
    // below can pass in that gap and tear the mock server down while the
    // key GET is still in flight (route.fetch -> ECONNREFUSED, flaky in CI).
    const chatsKeyResponse = page.waitForResponse((response) =>
      response
        .url()
        .includes(
          `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${TestData.mary.settings!.chats}/keys/`,
        ),
    );
    await chatsLink.click();

    // Then
    await expect(
      page.getByRole("heading", {
        name: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      }),
    ).toBeVisible();
    await chatsKeyResponse;
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  // Accepting re-reads the "chats" document a second time (see
  // ContactService.acceptContactRequest) - use the SAME key for both
  // registered reads below so it doesn't matter which of the two
  // identical-looking interactions the mock server matches which request
  // against.
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  await prepareMarysContactRequests(chatsDocumentKey);

  // Accepting first ensures mary has a named public profile of her own
  // (§3.6) - she already has one here, so this is a read, not a create/prompt.
  const { publicProfileId } = await prepareMarysNamedPublicProfile();

  // No fetch of bill's public key is needed here - it was already sent
  // along with the ContactRequest itself (see
  // ContactService.acceptContactRequest).
  const builder = provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to accept bills invitation")
    .withRequest(
      "PUT",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // We don't exact-match the wrapped chat key because it's generated
        // dynamically (see ContactService.acceptContactRequest).
        r.jsonBody({
          inviter: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          invitee: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          status: "ACCEPTED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
          sharedKey: MatchersV3.string("dummy-encrypted-key"),
          publicProfileId,
        });
      },
    )
    .willRespondWith(204);

  // Accepting re-reads the "chats" document (a second GET, distinct from the
  // one the initial page load already consumed via
  // prepareMarysContactRequests() above) and records bill there - the chat
  // Document itself is created by bill, the inviter, later on (ADR 0015).
  await prepareMarysChatsDocument(
    [],
    "mary has no contacts and a contact request from bill",
    chatsDocumentKey,
  );
  prepareMarysChatsDocumentUpdate(
    "mary has no contacts and a contact request from bill",
  );
  // ... and shares mary's public profile into the chat with bill (§3.2).
  prepareMarysPublicProfileShare(
    publicProfileId,
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
  );

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
        name: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      })
      .locator("../..");
    await expect(invitationPanel).toBeVisible();
    await expect(invitationPanel).toContainText(
      "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
    );

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
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
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
        name: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      })
      .locator("../..");
    await expect(invitationPanel).toBeVisible();
    await expect(invitationPanel).toContainText(
      "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
    );

    // Act: Decline Laura
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("pick up an accepted invitation (inviter side)", async ({ page }) => {
  // The inviter's side of the handshake (leg 3 of ADR 0015, ContactService.
  // receiveContactRequest, driven by Chats.tsx's second effect): Bill
  // already accepted Mary's invitation, and Mary - without any action on
  // her part - derives the chat key, creates the chat Document together with
  // Bill's contact entry, and confirms receipt so the server files Bill's key
  // entry under the chat. Unlike accepting/declining, this needs no button
  // click; it happens as soon as the contact-requests list loads.
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  const given = "mary has no contacts and bill has accepted marys invitation";
  const chatId = "chat-bill-for-mary";
  const chatsDocumentKey = await generateAesGcmKeyJwk();

  await prepareMarysAcceptedContactRequest(chatId, given, chatsDocumentKey);

  // receiveContactRequest re-reads the "chats" document a second time
  // before appending the new contact - same shape as the accept flow's own
  // double-read (see prepareMarysContactRequests).
  await prepareMarysChatsDocument([], given, chatsDocumentKey);

  // receiveContactRequest also ensures mary's own public profile (already
  // named here, §3.6) and shares it into the chat with bill (§3.2).
  const { publicProfileId } = await prepareMarysNamedPublicProfile(
    "Mary",
    given,
  );
  prepareMarysPublicProfileShare(
    publicProfileId,
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
    given,
  );
  await prepareMarysChatCreation(chatId, given);

  const builder = provider
    .addInteraction()
    .given(given)
    // The chat Document mary created just before (confirmReceipt 409s
    // without it).
    .given("a document exists", {
      ownerId: "d20cf443-4f96-418f-a957-c8cbef8677c3",
      documentId: chatId,
      kid: TestData.mary.settings!.chats,
      issuer: "d20cf443-4f96-418f-a957-c8cbef8677c3",
    })
    .uponReceiving("a request of mary to confirm receipt of bills contact")
    .withRequest(
      "PUT",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        // No key any more: the server files bill's own key entry (from his
        // ACCEPTED update) under the chat Document mary just created.
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

    // Wait for the documents page to finish loading both of Mary's images
    // before navigating away - prepareMarysDocuments() registers exact-count
    // interactions for their file GETs, and in CI the Chats navigation can
    // otherwise happen before those requests fire, leaving them unconsumed.
    // Each <img> only renders once its content GET has resolved, so a count
    // of two is proof both file requests completed.
    await expect(page.locator("main img")).toHaveCount(2);

    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    // Bill shows up as a contact automatically. .first() because the
    // contact list item shows the email twice (heading + subtitle) - same
    // pattern used for other contacts elsewhere in this suite.
    await expect(
      page.getByText("a358c2ed-07d4-4a25-a7db-d860d5c0b895").first(),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
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

    // Still exactly one entry for bill (heading + subtitle).
    await expect(
      page.getByText("a358c2ed-07d4-4a25-a7db-d860d5c0b895"),
    ).toHaveCount(2);
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
