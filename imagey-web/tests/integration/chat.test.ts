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
  prepareMarysChat,
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
  await prepareMarysDocuments();

  await prepareMarysChat("laura@imagey.cloud", " for chat");

  provider
    .addInteraction()
    .uponReceiving("a request to receive messages")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
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
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
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
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
      (r) => {
        r.headers({
          "Content-Type": "text/plain",
        });
      },
    )
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages/msg-1234",
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
    const input = page.getByPlaceholder("Type a message");
    await input.fill("Hi Laura, nice to chat!");
    await page.getByRole("button", { name: "send" }).click();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send empty message does not submit", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  await prepareMarysChat("alice@imagey.cloud", " for empty chat");

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to receive messages for empty chat")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/alice@imagey.cloud/messages",
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

    const input = page.getByPlaceholder("Type a message");

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
  await prepareMarysDocuments();

  await prepareMarysChat("alice@imagey.cloud", " for failing chat");

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to receive messages for failing chat")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/alice@imagey.cloud/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route(
      "**/users/mary@imagey.cloud/contacts/alice@imagey.cloud/messages*",
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

    const input = page.getByPlaceholder("Type a message");

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
  await prepareMarysDocuments();

  const builder = await prepareMarysChat(
    "alice@imagey.cloud",
    " for polling fail",
  );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route(
      "**/users/mary@imagey.cloud/contacts/alice@imagey.cloud/messages*",
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
    const input = page.getByPlaceholder("Type a message");
    await expect(input).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decryption error shows reissue dialog", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  const builder = await prepareMarysChat(
    "alice@imagey.cloud",
    " for decryption error",
    false, // pass invalidKey
  );

  provider
    .addInteraction()
    .uponReceiving("a request to receive messages for decryption error")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/alice@imagey.cloud/messages",
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  provider
    .addInteraction()
    .given("Mary has a chat with alice")
    .uponReceiving("a request to reissue key")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/alice@imagey.cloud/key",
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({
          userKey: {
            issuer: MatchersV3.like("mary@imagey.cloud"),
            kid: MatchersV3.like("0"),
            sharedKey: MatchersV3.like("dummy-key"),
          },
          contactKey: {
            issuer: MatchersV3.like("alice@imagey.cloud"),
            kid: MatchersV3.like("0"),
            sharedKey: MatchersV3.like("dummy-key"),
          },
        });
      },
    )
    .willRespondWith(204);

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    const aliceContact = page.getByText("alice@imagey.cloud").first();
    await expect(aliceContact).toBeVisible();
    await aliceContact.click();

    // Dialog should appear
    await expect(
      page.getByRole("heading", { name: "Decryption Error" }),
    ).toBeVisible();

    // Click Re-Issue
    await page.getByRole("button", { name: "Re-Issue" }).click();

    // Dialog should disappear
    await expect(
      page.getByRole("heading", { name: "Decryption Error" }),
    ).toBeHidden();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
