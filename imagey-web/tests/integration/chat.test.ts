import { MatchersV3 } from "@pact-foundation/pact";

import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  runningPactRequests,
  prepareMarysDocuments,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysChat,
  prepareMarysChatsDocument,
  prepareMarysChatOwnedByAlice,
  prepareAlicesLogin,
  prepareAlicesEmptyDocumentsFolder,
  prepareAlicesChat,
  loginAsAlice,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test.afterEach("Clear IndexedDB", async ({ page }) => {
  try {
    await page.evaluate(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        window.indexedDB.deleteDatabase(db.name!);
      }
    });
  } catch (e) {
    console.error(e);
  }
});

test("view chat and send message", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  await prepareMarysChat("laura@imagey.cloud", " for chat");

  provider
    .addInteraction()
    .uponReceiving("a request to receive messages")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string("msg-123"),
          content: MatchersV3.string(
            TestData.mary.chats![0].messages[0].content,
          ),
        },
      ]),
    );

  // Since we use long polling, we might receive a second request for messages.
  // We mock the polling request with a sinceId
  provider
    .addInteraction()
    .uponReceiving("a request to receive more messages")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/chat-laura/messages",
      (r) => {
        r.query({ sinceId: "msg-123" });
        r.headers({ Prefer: "wait=30" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to send a message")
    .withRequest(
      "POST",
      "/users/mary@imagey.cloud/documents/chat-laura/messages",
      (r) => {
        r.headers({
          "Content-Type": "text/plain",
        });
      },
    )
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          "/users/mary@imagey.cloud/documents/chat-laura/messages/msg-1234",
        ),
      });
    });

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Go to Chats
    await page.getByRole("link", { name: "Chats" }).first().click();

    // Click on Laura's contact
    const lauraContact = page.getByText("laura@imagey.cloud").first();
    await expect(lauraContact).toBeVisible();
    await lauraContact.click();

    // Verify chat UI loaded
    await expect(
      page.getByRole("heading", { name: "laura@imagey.cloud" }),
    ).toBeVisible();

    // Verify received message is decrypted and shown
    await expect(page.getByText("Hello Mary, this is Laura!")).toBeVisible();

    // Send a message
    const input = page.getByLabel("Type a message");
    await input.fill("Hi Laura, nice to chat!");

    const postResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes("/users/mary@imagey.cloud/documents/chat-laura/messages") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "send" }).click();
    await postResponse;

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send empty message does not submit", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  await prepareMarysChat("alice@imagey.cloud", " for empty chat");

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to receive messages for empty chat")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/chat-alice/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("alice@imagey.cloud").first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    await expect(
      page.getByRole("heading", { name: "alice@imagey.cloud" }),
    ).toBeVisible();

    const input = page.getByLabel("Type a message");

    // Try to send an empty message
    await input.fill("   ");
    await page.getByRole("button", { name: "send" }).click();

    // Input should remain unchanged and no POST request should have been made
    // (Pact will fail if a POST is made because we didn't add an interaction for it)
    await expect(input).toHaveValue("   ");

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send message fails and restores input", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysChat("alice@imagey.cloud", " for failing chat");

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to receive messages for failing chat")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/chat-alice/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route(
      "**/users/mary@imagey.cloud/documents/chat-alice/messages*",
      async (route, request) => {
        if (request.method() === "POST") {
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("alice@imagey.cloud").first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    await expect(
      page.getByRole("heading", { name: "alice@imagey.cloud" }),
    ).toBeVisible();

    const input = page.getByLabel("Type a message");

    await input.fill("This will fail");
    await page.getByRole("button", { name: "send" }).click();

    // Input should be restored on failure
    await expect(input).toHaveValue("This will fail");

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("polling fails gracefully", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  const builder = await prepareMarysChat(
    "alice@imagey.cloud",
    " for polling fail",
  );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route(
      "**/users/mary@imagey.cloud/documents/chat-alice/messages*",
      async (route, request) => {
        if (request.method() === "GET") {
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("alice@imagey.cloud").first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    // Verify chat UI loaded, which means sharedKey was fetched
    // and polling attempted (which hits 500 error)
    await expect(
      page.getByRole("heading", { name: "alice@imagey.cloud" }),
    ).toBeVisible();

    // Give it a tiny bit of time to ensure catch block is executed
    await page.waitForTimeout(500);

    // The chat UI should still be there, just without messages
    const input = page.getByLabel("Type a message");
    await expect(input).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

// "decryption error shows an error message" moved to errors.test.ts: it
// needs the chat Document's key entry to come back genuinely undecryptable,
// which isn't a real provider behavior worth putting in the Pact contract -
// see errors.test.ts's own header comment on why that file uses Playwright
// routing instead of Pact for cases like this.

test("share a document in chat", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  await prepareMarysChat("laura@imagey.cloud", " for sharing doc");

  // Interaction to receive messages (empty)
  provider
    .addInteraction()
    .uponReceiving("a request to receive messages before sharing")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string("msg-123"),
          content: MatchersV3.string(
            TestData.mary.chats![0].messages[0].content,
          ),
        },
      ]),
    );

  provider
    .addInteraction()
    .uponReceiving("a request to receive more messages before sharing")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/chat-laura/messages",
      (r) => r.query({ sinceId: "msg-123" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const documentId = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3";

  // Interaction to store the shared key
  provider
    .addInteraction()
    .uponReceiving("a request to store shared key")
    .withRequest(
      "POST",
      `/users/mary@imagey.cloud/documents/${documentId}/keys`,
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({
          issuer: MatchersV3.string("laura@imagey.cloud"),
          kid: MatchersV3.string("laura@imagey.cloud"),
          sharedKey: MatchersV3.string("ZHVtbXkta2V5"), // Pact will just match the structure/type
        });
      },
    )
    .willRespondWith(200);

  // Interaction to post the message
  const builder = provider
    .addInteraction()
    .uponReceiving("a request to send a shared document message")
    .withRequest(
      "POST",
      "/users/mary@imagey.cloud/documents/chat-laura/messages",
      (r) => {
        r.headers({ "Content-Type": "text/plain" });
      },
    )
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          "/users/mary@imagey.cloud/documents/chat-laura/messages/msg-1234",
        ),
      });
    });

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const lauraContact = page.getByText("laura@imagey.cloud").first();
    await expect(lauraContact).toBeVisible();
    await lauraContact.click();

    // Click attach button
    await page.getByRole("button", { name: "attach_file" }).click();

    // Expect the dialog to show
    await expect(page.getByText("Share Document")).toBeVisible();

    const messageResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes("/users/mary@imagey.cloud/documents/chat-laura/messages") &&
        response.request().method() === "POST",
    );

    // Share bb66aba3 specifically (the document all the interactions above are
    // keyed to) - clicking whichever thumbnail happens to be `dialog img`
    // first is order-dependent and racy under a full-suite run.
    await page.locator("dialog").getByAltText("beach-1836467_1920.jpg").click();

    // Verify it sent
    await messageResponse;
    await expect.poll(() => runningPactRequests).toBe(0);

    // Wait for the image to render to ensure all network requests complete and
    // mocks are consumed. Under a full-suite run (workers: 1, so this shares
    // one Node/browser process with every earlier test) this decrypt+render
    // can take noticeably longer than in isolation - match the 10s
    // convention used for image assertions elsewhere in the suite.
    await expect(page.locator(".shared-document img")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".shared-document")).toBeVisible();
  });
});

test("view shared document from another user", async ({ page }) => {
  await prepareAlicesLogin();
  await prepareAlicesEmptyDocumentsFolder();
  const builder = await prepareAlicesChat(
    "mary@imagey.cloud",
    " for viewing doc",
  );

  const documentId = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3";

  // Interaction to receive messages containing the shared document
  builder
    .addInteraction()
    .given("Alice has received a message from Mary with shared doc")
    .uponReceiving("a request to receive messages with shared doc")
    .withRequest(
      "GET",
      "/users/alice@imagey.cloud/documents/chat-mary/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: "msg-999",
          content:
            "aeCDPI47cicIa11xsEcrIoJ61HTdQzttLFprdqPYP1eayYPs8/65ktZ0DxZgs6+MSOxeCpqTZGFerRWze9AzCjaKpBJGq12foAZlbFfp56WzzAMeFg8JpT8bD/AYh6VBEa77Ipl2BLSpE5Jlszr45nDLQTzg8J3pb3EQiD8TpcndgU1Zyuc=",
        },
      ]),
    );

  builder
    .addInteraction()
    .given("Alice has received a message from Mary with shared doc")
    .uponReceiving("a request to receive more messages after shared doc")
    .withRequest(
      "GET",
      "/users/alice@imagey.cloud/documents/chat-mary/messages",
      (r) => r.query({ sinceId: "msg-999" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Load the shared key for Alice as a member. The `issuer` is Alice
  // herself: sharing a document into a chat files the key entry with the
  // recipient as issuer, which is exactly what grants them the member role
  // (see DocumentService.shareDocument / RolesFilter). The document's real
  // owner (mary) is tracked separately by loadDocument as `document.owner`.
  builder
    .addInteraction()
    .given("Mary has shared a document with alice")
    .uponReceiving("a request to load shared key as recipient")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/${documentId}/keys/alice@imagey.cloud`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        issuer: "alice@imagey.cloud",
        // The key is filed under the recipient's own kid (their email), which is
        // exactly the path segment requested above - the server echoes it back.
        kid: "alice@imagey.cloud",
        // This is a genuine encryption of bb66aba3's document key
        // (TestData "k": "NWx3KUTQIOMBUKIcF7aOoIuCsRiaNeUo5hcHBfHSoI8") using
        // the real Alice<->Mary chat symmetric key (the same key that
        // decrypts TestData.mary.chats[1].encryptedSharedKey), so that the
        // app's actual decryptKey() call succeeds end-to-end. Matched loosely on
        // the provider side - the ContractTest fixture carries its own bytes.
        sharedKey: MatchersV3.string(
          "B7OIlG+D7Z15BcJ6DpjC1DDsBmSPXO0ZubqsWF/cCWWHseD6HS5hGiqAgn9WQ5dqLADklsIjeAVaoP+XYpA3bQa8azD2rAzpioGo5D6zO9rbJR/+ZiLmIicw4da4VVcdsBl2Xm6JmexlpSUfI1kv+++YArKMS8Ci1/vuVPOD8tipem5V4s8hUewfDPUdMo1NrrzUFeUm",
        ),
      }),
    );

  // Interaction to load the document content (mirrors prepareMarysDocuments'
  // fixture for the same document, reused here since Alice fetches it from
  // Mary's namespace).
  builder
    .addInteraction()
    .given("Mary has shared a document with alice")
    .uponReceiving("a request to get the document content as recipient")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/${documentId}`,
      (r) => r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/document.enc`,
      ),
    );

  // Interaction to load the file
  await builder
    .addInteraction()
    .given("Mary has shared a document with alice")
    .uponReceiving("a request to get the shared document file as recipient")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/${documentId}/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0`,
      (r) => r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0`,
      ),
    )
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await loginAsAlice(page);

      await page.getByRole("link", { name: "Chats" }).first().click();
      const maryContact = page.getByText("mary@imagey.cloud").first();
      await expect(maryContact).toBeVisible();
      await maryContact.click();

      // Verify chat UI loaded
      await expect(
        page.getByRole("heading", { name: "mary@imagey.cloud" }),
      ).toBeVisible();

      // The image should appear in the chat stream! Same full-suite timing
      // note as in "share a document in chat" above - bumped to 10s.
      const sharedDocImage = page.locator(".shared-document img").first();
      await expect(sharedDocImage).toBeVisible({ timeout: 10_000 });

      await page.unrouteAll({ behavior: "ignoreErrors" });
    });
});

test("view chat owned by another user (synced chat key)", async ({ page }) => {
  // Mary has a contact whose chat SHE didn't create - Alice accepted an
  // invitation from Mary (or vice versa) and is the chat Document's real
  // owner, so opening it exercises the non-owner branch of
  // ContactService.loadChatKey, unlike every other chat test in this file
  // (which - via prepareMarysChat/prepareAlicesChat - always model the
  // chat as self-owned). Mary's key entry there was synced by the server
  // and is wrapped under her own chats-document key.
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  const chatId = "chat-alice-owned";
  const chatsDocumentKey = await prepareMarysChatsDocument([
    { userId: "alice@imagey.cloud", chatId, owner: "alice@imagey.cloud" },
  ]);
  await prepareMarysChatOwnedByAlice(chatId, chatsDocumentKey);

  provider
    .addInteraction()
    .given("Alice owns a chat shared with mary")
    .uponReceiving("a request to receive messages for the alice-owned chat")
    .withRequest(
      "GET",
      "/users/alice@imagey.cloud/documents/chat-alice-owned/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const builder = provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get contact requests for the ecdh chat test",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({ Accept: "application/json" });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("alice@imagey.cloud").first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    // Chat opens normally - the ECDH-wrapped key decrypted successfully,
    // so no decryption error is shown (see errors.test.ts for what that
    // looks like when it fails). The heading renders unconditionally
    // (it's just the contactEmail prop), so wait for the message input
    // instead - it only appears once both the key decrypted AND the first
    // messages fetch resolved, which is what actually forces this test to
    // wait for the ECDH round trip instead of racing ahead of it.
    await expect(
      page.getByRole("heading", { name: "alice@imagey.cloud" }),
    ).toBeVisible();
    await expect(page.getByLabel("Type a message")).toBeVisible();
    await expect(
      page.getByText(
        "There was an error decrypting the messages. This may be because the keys have changed.",
      ),
    ).not.toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send a message in a chat owned by another user (posts to the owner's tree)", async ({
  page,
}) => {
  // The send-side counterpart to "view chat owned by another user": Mary is
  // NOT the chat Document's owner (Alice is), so her send must address
  // Alice's tree - Mary is a "member" there via the server-synced chat-key
  // entry. Nothing about a send touches Mary's own tree.
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  // Same chat id as "view chat owned by another user" so this reuses the
  // "Alice owns a chat shared with mary" provider state (the chat Document
  // + Mary's synced key entry in Alice's tree).
  const chatId = "chat-alice-owned";
  const chatsDocumentKey = await prepareMarysChatsDocument([
    { userId: "alice@imagey.cloud", chatId, owner: "alice@imagey.cloud" },
  ]);
  await prepareMarysChatOwnedByAlice(chatId, chatsDocumentKey);

  provider
    .addInteraction()
    .given("Alice owns a chat shared with mary")
    .uponReceiving(
      "a request to receive messages for the alice-owned chat (send test)",
    )
    .withRequest(
      "GET",
      `/users/alice@imagey.cloud/documents/${chatId}/messages`,
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get contact requests for the alice-owned send test",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({ Accept: "application/json" });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));

  const builder = provider
    .addInteraction()
    .given("Alice owns a chat shared with mary")
    .uponReceiving(
      "a request of mary to send a message into the alice-owned chat",
    )
    .withRequest(
      "POST",
      `/users/alice@imagey.cloud/documents/${chatId}/messages`,
      (r) => {
        r.headers({ "Content-Type": "text/plain" });
      },
    )
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          `/users/alice@imagey.cloud/documents/${chatId}/messages/msg-9001`,
        ),
      });
    });

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("alice@imagey.cloud").first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    const input = page.getByLabel("Type a message");
    await expect(input).toBeVisible();
    await input.fill("Hi Alice, Mary here");

    const postResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/users/alice@imagey.cloud/documents/${chatId}/messages`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "send" }).click();
    await postResponse;

    // Optimistically appended once the POST resolved.
    await expect(page.getByText("Hi Alice, Mary here")).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
