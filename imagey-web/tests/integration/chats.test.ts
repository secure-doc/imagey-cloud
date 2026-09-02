import { MatchersV3 } from "@pact-foundation/pact";
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
        // We don't exact-match the encrypted key/chatId because they're
        // generated dynamically (see ContactService.acceptContactRequest).
        r.jsonBody({
          inviter: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          invitee: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          status: "ACCEPTED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
          chatId: MatchersV3.string("new-chat-id"),
          sharedKey: MatchersV3.string("dummy-encrypted-key"),
          publicProfileId,
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
  // ... and shares mary's public profile into the new chat with bill (§3.2).
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
  // The inviter's side of the handshake (ContactService.
  // receiveContactRequest, driven by Chats.tsx's second effect): Bill
  // already accepted Mary's invitation, and Mary - without any action on
  // her part - decrypts her ECDH-shared copy of the chat key, records Bill
  // as a contact, and confirms receipt so the server can delete the
  // now-redundant request. Unlike accepting/declining, this needs no
  // button click; it happens as soon as the contact-requests list loads.
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  const given = "mary has no contacts and bill has accepted marys invitation";
  const chatId = "chat-bill-for-mary";
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const chatDocumentKey = await generateAesGcmKeyJwk();

  await prepareMarysAcceptedContactRequest(
    chatId,
    chatDocumentKey,
    given,
    chatsDocumentKey,
  );

  // receiveContactRequest re-reads the "chats" document a second time
  // before appending the new contact and re-uploading it - same shape as
  // the accept flow's own double-read (see prepareMarysContactRequests).
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

  provider
    .addInteraction()
    .given(given)
    .uponReceiving("a request of mary to store the picked-up contact")
    .withRequest(
      "PUT",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${TestData.mary.settings!.chats}`,
      (r) => {
        r.headers({ "Content-Type": "application/octet-stream" });
      },
    )
    .willRespondWith(204);

  const builder = provider
    .addInteraction()
    .given(given)
    .uponReceiving("a request of mary to confirm receipt of bills contact")
    .withRequest(
      "PUT",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        // chatKey is the chat Document key re-wrapped under Mary's own
        // chats-document key (issuer = Mary); the server files it under the
        // chat Document in Bill's tree so Mary keeps access to the chat.
        r.jsonBody({
          inviter: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          invitee: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          status: "RECEIVED",
          chatKey: {
            issuer: MatchersV3.string("d20cf443-4f96-418f-a957-c8cbef8677c3"),
            kid: MatchersV3.string(TestData.mary.settings!.chats),
            sharedKey: MatchersV3.string("ZHVtbXktY2hhdC1rZXk="),
          },
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
  const chatDocumentKey = await generateAesGcmKeyJwk();

  await prepareMarysAcceptedContactRequest(
    chatId,
    chatDocumentKey,
    given,
    chatsDocumentKey,
  );
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

  const builder = provider
    .addInteraction()
    .given(given)
    .uponReceiving(
      "a request of mary to store the picked-up contact before a failing confirm",
    )
    .withRequest(
      "PUT",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${TestData.mary.settings!.chats}`,
      (r) => {
        r.headers({ "Content-Type": "application/octet-stream" });
      },
    )
    .willRespondWith(204);

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
