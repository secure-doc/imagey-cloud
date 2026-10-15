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
  prepareMarysChatWithContactProfile,
  sentMessageBody,
  messageId,
  messageIdAt,
  messageTimestamp,
  pactMessageTimestamp,
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
  await page.clock.setFixedTime(new Date("2026-10-06T18:00:00Z"));
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  await prepareMarysChat("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6", " for chat");

  provider
    .addInteraction()
    .uponReceiving("a request to receive messages")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string(messageId(123)),
          content: MatchersV3.string(
            TestData.mary.chats![0].messages[0].content,
          ),
          timestamp: MatchersV3.datetime(
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            messageTimestamp(123),
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
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => {
        r.query({ sinceId: messageId(123) });
        r.headers({ Prefer: "wait=30" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to send a message")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => {
        r.headers({
          "Content-Type": "text/plain",
        });
      },
    )
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages/${messageId(1234)}`,
        ),
      }).jsonBody(sentMessageBody(1234));
    });

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Go to Chats
    await page.getByRole("link", { name: "Chats" }).first().click();

    // Click on Laura's contact
    const lauraContact = page.getByText("Laura", { exact: true }).first();
    await expect(lauraContact).toBeVisible();
    await lauraContact.click();

    // Verify chat UI loaded
    await expect(
      page.getByRole("banner").getByRole("heading", {
        name: "Laura",
        exact: true,
      }),
    ).toBeVisible();

    // Verify received message is decrypted and shown
    await expect(page.getByText("Hello Mary, this is Laura!")).toBeVisible();
    // ... with its time (Europe/Berlin, CEST) and a "Today" day separator
    await expect(page.locator("time")).toHaveText(/3:03|15:03/);
    await expect(page.getByText("Today", { exact: true })).toBeVisible();
    const lauraEntry = page.getByRole("listitem").filter({ hasText: "Laura" });
    await expect(lauraEntry.locator("label")).toHaveText(/3:03|15:03/);

    // Send a message
    const input = page.getByLabel("Type a message");
    await input.fill("Hi Laura, nice to chat!");

    const postResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
          ) && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "send" }).click();
    await postResponse;

    // The own message shows the time the server stamped right away
    await expect(page.locator("time")).toHaveCount(2);
    await expect(page.locator("time").last()).toHaveText(/3:21|15:21/);
    await expect(page.getByText("Today", { exact: true })).toHaveCount(1);
    // The chat list follows the conversation: laura's entry shows the time of
    // the newest message, the one just sent
    await expect(lauraEntry.locator("label")).toHaveText(/3:21|15:21/);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("show day separators for messages of several days", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-06T18:00:00Z"));
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  await prepareMarysChat("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6", " for chat");

  // The first message is a legacy one: stored without timestamp, which the
  // server derives from the time prefix of its id.
  const times = [
    "2026-01-02T10:00:00.000Z",
    "2026-10-05T10:00:00.000Z",
    "2026-10-06T10:00:00.000Z",
    "2026-10-06T10:05:00.000Z",
  ];
  const ids = times.map((time, i) => messageIdAt(Date.parse(time), i));
  const content = TestData.mary.chats![0].messages[0].content;
  provider
    .addInteraction()
    .given("a document has messages with timestamps", {
      ownerId: "d20cf443-4f96-418f-a957-c8cbef8677c3",
      documentId: "chat-laura",
      sender: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
      messages: times.map((timestamp, i) =>
        i === 0 ? { id: ids[i] } : { id: ids[i], timestamp },
      ),
    })
    .uponReceiving("a request to receive messages of several days")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(
        times.map((timestamp, i) => ({
          id: MatchersV3.string(ids[i]),
          content: MatchersV3.string(content),
          timestamp: MatchersV3.datetime(
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            timestamp,
          ),
        })),
      ),
    );
  const builder = provider
    .addInteraction()
    .given("a document has messages with timestamps", {
      ownerId: "d20cf443-4f96-418f-a957-c8cbef8677c3",
      documentId: "chat-laura",
      sender: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
      messages: times.map((timestamp, i) =>
        i === 0 ? { id: ids[i] } : { id: ids[i], timestamp },
      ),
    })
    .uponReceiving("a request to receive more messages of several days")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => {
        r.query({ sinceId: ids[3] });
        r.headers({ Prefer: "wait=30" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByText("Laura", { exact: true }).first().click();

    await expect(page.getByText("Hello Mary, this is Laura!")).toHaveCount(4);
    await expect(page.locator("time")).toHaveCount(4);
    // separators: Jan 2 (a date), yesterday, today (once for two messages)
    await expect(page.locator(".chip")).toHaveText([
      /Jan 2, 2026|02\.01\.2026/,
      "Yesterday",
      "Today",
    ]);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("show the last activity of each chat in the chat list", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-06T18:00:00Z"));
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysChat("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6", " for chat");
  provider
    .addInteraction()
    .uponReceiving("a request to receive messages")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string(messageId(123)),
          content: MatchersV3.string(
            TestData.mary.chats![0].messages[0].content,
          ),
          timestamp: MatchersV3.datetime(
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            messageTimestamp(123),
          ),
        },
      ]),
    );
  provider
    .addInteraction()
    .uponReceiving("a request to receive more messages")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => {
        r.query({ sinceId: messageId(123) });
        r.headers({ Prefer: "wait=30" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // laura's chat has messages, alice's none
  provider
    .addInteraction()
    .uponReceiving("a request for the last activity of laura's chat")
    .withRequest(
      "HEAD",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Last-Modified": "Tue, 06 Oct 2026 13:03:12 GMT" }),
    );
  const builder = provider
    .addInteraction()
    .given("Mary has a chat with alice")
    .uponReceiving("a request for the last activity of an empty chat")
    .withRequest(
      "HEAD",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/chat-mary/messages",
    )
    .willRespondWith(200);

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer, { lastActivityViaPact: true });
    await loginAsMary(page);
    await page.getByRole("link", { name: "Chats" }).first().click();
    const messages = page.waitForResponse(
      (response) =>
        response.url().includes("/chat-laura/messages") &&
        response.request().method() === "GET",
    );
    const lauraContact = page.getByText("Laura", { exact: true }).first();
    await expect(lauraContact).toBeVisible();
    await lauraContact.click();
    await messages;

    const laura = page.getByRole("listitem").filter({ hasText: "Laura" });
    // today: the time of day, in Europe/Berlin
    await expect(laura.locator("label")).toHaveText(/3:03|15:03/);
    await expect(
      page.getByRole("listitem").filter({ hasText: "Alice" }).locator("label"),
    ).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send empty message does not submit", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  await prepareMarysChat(
    "10ad1cce-816b-4e12-b94d-7ef824c0d162",
    " for empty chat",
  );

  const builder = provider
    .addInteraction()
    .given("Mary has a chat with alice")
    .uponReceiving("a request to receive messages for empty chat")
    .withRequest(
      "GET",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/chat-mary/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("Alice", { exact: true }).first();
    await expect(aliceContact).toBeVisible();
    // The heading renders before the messages are requested; without waiting
    // for that request the test can end (and the mock server go away) before
    // it is made - see runningPactRequests race.
    const messages = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/chat-mary/messages",
          ) && response.request().method() === "GET",
    );
    await aliceContact.click();

    await expect(
      page.getByRole("banner").getByRole("heading", {
        name: "Alice",
        exact: true,
      }),
    ).toBeVisible();
    await messages;

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
  await prepareMarysChat(
    "10ad1cce-816b-4e12-b94d-7ef824c0d162",
    " for failing chat",
  );

  const builder = provider
    .addInteraction()
    .given("Mary has a chat with alice")
    .uponReceiving("a request to receive messages for failing chat")
    .withRequest(
      "GET",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/chat-mary/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route(
      "**/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/chat-mary/messages*",
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
    const aliceContact = page.getByText("Alice", { exact: true }).first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    await expect(
      page.getByRole("banner").getByRole("heading", {
        name: "Alice",
        exact: true,
      }),
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
    "10ad1cce-816b-4e12-b94d-7ef824c0d162",
    " for polling fail",
  );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route(
      "**/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/chat-mary/messages*",
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
    const aliceContact = page.getByText("Alice", { exact: true }).first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    // Verify chat UI loaded, which means sharedKey was fetched
    // and polling attempted (which hits 500 error)
    await expect(
      page.getByRole("banner").getByRole("heading", {
        name: "Alice",
        exact: true,
      }),
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

  await prepareMarysChat(
    "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
    " for sharing doc",
  );

  // Interaction to receive messages (empty)
  provider
    .addInteraction()
    .uponReceiving("a request to receive messages before sharing")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string(messageId(123)),
          content: MatchersV3.string(
            TestData.mary.chats![0].messages[0].content,
          ),
          timestamp: pactMessageTimestamp(123),
        },
      ]),
    );

  provider
    .addInteraction()
    .uponReceiving("a request to receive more messages before sharing")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => r.query({ sinceId: messageId(123) }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const documentId = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3";

  // Interaction to store the shared key
  provider
    .addInteraction()
    .uponReceiving("a request to store shared key")
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentId}/keys`,
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({
          issuer: MatchersV3.string("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6"),
          kid: MatchersV3.string("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6"),
          sharedKey: MatchersV3.string("ZHVtbXkta2V5"), // Pact will just match the structure/type
        });
      },
    )
    .willRespondWith(200);

  // Interaction to load the small image content once the message renders in
  // the chat stream - chat shows the small image, not the medium one; its
  // smallImageId is the document's own id (see
  // scripts/encryptMarysDocuments.ts).
  provider
    .addInteraction()
    .uponReceiving("a request to get the small image content after sharing")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentId}/files/${documentId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/files/${documentId}`,
      ),
    );

  // Opening the shared image in the detail view loads the medium image, and
  // the small one once more as placeholder while it loads.
  provider
    .addInteraction()
    .uponReceiving("a request to get the small image content as placeholder")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentId}/files/${documentId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/files/${documentId}`,
      ),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request to get the medium image content of a shared image",
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentId}/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0`,
      ),
    );

  // Interaction to post the message
  const builder = provider
    .addInteraction()
    .uponReceiving("a request to send a shared document message")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => {
        r.headers({ "Content-Type": "text/plain" });
      },
    )
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages/${messageId(1234)}`,
        ),
      }).jsonBody(sentMessageBody(1234));
    });

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const lauraContact = page.getByText("Laura", { exact: true }).first();
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
          .includes(
            "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
          ) && response.request().method() === "POST",
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

    // A click on the shared image opens it large in the detail view
    const mediumLoaded = page.waitForResponse((response) =>
      response
        .url()
        .includes(
          `/documents/${documentId}/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0`,
        ),
    );
    await page.locator(".shared-document img").click();
    await expect(page).toHaveURL(
      `/images/${documentId}?chat=7f53a4ea-58b7-4bbf-b94d-f2038752d5b6&owner=d20cf443-4f96-418f-a957-c8cbef8677c3`,
    );
    await mediumLoaded;
    await expect(page.locator(".shared-document")).toBeHidden();
    await expect(page.locator("main img")).toHaveCount(1);
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("view chat shows the contact's display name and avatar", async ({
  page,
}) => {
  // §3.4: once a chat's metadata carries both parties' public-profile ids and
  // the contact has actually shared theirs into the chat, the chat header
  // shows their name/avatar instead of their raw userId.
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();

  const avatarBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  await prepareMarysChatWithContactProfile({
    contactUserId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
    contactName: "Laura Doe",
    contactAvatarId: "avatar-laura",
    contactAvatarContent: avatarBytes,
  });

  // Unlike "view chat and send message" above, this test never sends a
  // message, so it does not reliably run a second (polling) messages fetch -
  // only the initial one is mocked, same as "send empty message does not
  // submit" elsewhere in this file.
  const builder = provider
    .addInteraction()
    .uponReceiving("a request to receive messages for laura's named chat")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string(messageId(123)),
          content: MatchersV3.string(
            TestData.mary.chats![0].messages[0].content,
          ),
          timestamp: pactMessageTimestamp(123),
        },
      ]),
    );

  // Laura's ContactEntry snapshot (prepareMarysChatsDocument's default
  // profileRevision, "0") is stale against her real, just-loaded
  // PublicProfileMetadata.revision (mockOwnedDocument's real ETag) - opening
  // the chat should refresh it in the "chats" document (see Chat.tsx's
  // profile-revision-mismatch effect / ContactService.
  // updateContactProfileSnapshot).
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to refresh laura's contact profile snapshot",
    )
    .withRequest(
      "PUT",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${TestData.mary.settings!.chats}`,
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"chats-v2"') }),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const lauraContact = page.getByText("Laura", { exact: true }).first();
    await expect(lauraContact).toBeVisible();
    // The stale-snapshot refresh (see Chat.tsx's profile-revision-mismatch
    // effect) fires as soon as the contact's real profile loads, which can
    // happen before any assertion below gets a chance to await it - start
    // listening before the click that kicks the whole chain off.
    const snapshotRefreshResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/documents/${TestData.mary.settings!.chats}`) &&
        response.request().method() === "PUT",
    );
    await lauraContact.click();

    // The chat header now shows Laura's display name, not her raw userId
    // (shown in the app bar together with the avatar).
    await expect(
      page.getByRole("heading", { name: "Laura Doe" }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Laura Doe" })).toBeVisible();

    await snapshotRefreshResponse;

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
