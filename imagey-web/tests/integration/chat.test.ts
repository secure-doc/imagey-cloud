import { MatchersV3 } from "@pact-foundation/pact";
import * as fs from "fs";
import * as path from "path";

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
  prepareEmptyMarysDocuments,
  prepareMarysChat,
  prepareAlicesLogin,
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
  await prepareEmptyMarysDocuments();

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
    const input = page.getByLabel("Type a message");
    await input.fill("Hi Laura, nice to chat!");

    const postResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
          ) && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "send" }).click();
    await postResponse;

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("send empty message does not submit", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();

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
  await prepareEmptyMarysDocuments();
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
  await prepareEmptyMarysDocuments();

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
    const input = page.getByLabel("Type a message");
    await expect(input).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decryption error shows reissue dialog", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareEmptyMarysDocuments();

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
            issuerType: MatchersV3.like("USER"),
            issuer: MatchersV3.like("mary@imagey.cloud"),
            kid: MatchersV3.like("0"),
            sharedKey: MatchersV3.like("dummy-key"),
          },
          contactKey: {
            issuerType: MatchersV3.like("USER"),
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

  provider
    .addInteraction()
    .uponReceiving("a request to receive more messages before sharing")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
      (r) => r.query({ sinceId: "msg-123" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const documentId = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3";

  // Interaction to store the shared key
  provider
    .addInteraction()
    .uponReceiving("a request to store shared key")
    .withRequest(
      "PUT",
      `/users/mary@imagey.cloud/documents/${documentId}/keys/laura@imagey.cloud`,
      (r) => {
        r.headers({ "Content-Type": "application/json" });
        r.jsonBody({
          issuer: MatchersV3.string("mary@imagey.cloud"),
          kid: MatchersV3.string("0"),
          sharedKey: MatchersV3.string("ZHVtbXkta2V5"), // Pact will just match the structure/type
        });
      },
    )
    .willRespondWith(200);

  // Interaction to load the document metadata
  provider
    .addInteraction()
    .uponReceiving("a request to get the document metadata")
    .withRequest("GET", `/users/mary@imagey.cloud/documents/${documentId}`)
    .willRespondWith(200, (r) =>
      r.jsonBody({
        documentId: documentId,
        metadata:
          "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
        sharedKey: {
          issuerType: "FOLDER",
          issuer: "root-folder-id",
          kid: "0",
          sharedKey: fs.readFileSync(
            path.resolve(
              process.cwd(),
              `tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/root-folder-id/encrypted-shared.key`,
            ),
            "base64",
          ),
        },
      }),
    );

  // Interaction to post the message
  const builder = provider
    .addInteraction()
    .uponReceiving("a request to send a shared document message")
    .withRequest(
      "POST",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
      (r) => {
        r.headers({ "Content-Type": "text/plain" });
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
          .includes(
            "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
          ) && response.request().method() === "POST",
    );

    // Click on the first image to share it
    await page.locator("dialog img").first().click();

    // Verify it sent
    await messageResponse;
    await expect.poll(() => runningPactRequests).toBe(0);

    // Wait for the image to render to ensure all network requests complete and mocks are consumed.
    await expect(page.locator(".shared-document img")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator(".shared-document")).toBeVisible();
  });
});

test("view shared document from another user", async ({ page }) => {
  await prepareAlicesLogin();
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
      "/users/alice@imagey.cloud/contacts/mary@imagey.cloud/messages",
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
      "/users/alice@imagey.cloud/contacts/mary@imagey.cloud/messages",
      (r) => r.query({ sinceId: "msg-999" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Load the shared key for Alice as a recipient
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
        kid: "0",
        sharedKey:
          "lezn+6YMgHCKigQhu4DcXQMJiyF9zRVNN1YdB2muAVJmAxU7AXRDfTemxSxOGiccG+ujTXE+IpyduOXVmcLvA925GR19K1HkA07geFDdtRRzj0acDOq1nrhaTr+SSwTk0m0d/QLSeqt0CiHlwpwmD3MUOTyDHN91fumcwcyAR3P4vmVi/3K4EcyBeKhxJnPmvxa8/bo8",
      }),
    );

  // Interaction to load the document metadata
  builder
    .addInteraction()
    .given("Mary has shared a document with alice")
    .uponReceiving("a request to get the document metadata as recipient")
    .withRequest("GET", `/users/mary@imagey.cloud/documents/${documentId}`)
    .willRespondWith(200, (r) =>
      r.jsonBody({
        documentId: documentId,
        metadata:
          "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
        sharedKey: {
          issuer: "alice@imagey.cloud",
          kid: "0",
          sharedKey:
            "lezn+6YMgHCKigQhu4DcXQMJiyF9zRVNN1YdB2muAVJmAxU7AXRDfTemxSxOGiccG+ujTXE+IpyduOXVmcLvA925GR19K1HkA07geFDdtRRzj0acDOq1nrhaTr+SSwTk0m0d/QLSeqt0CiHlwpwmD3MUOTyDHN91fumcwcyAR3P4vmVi/3K4EcyBeKhxJnPmvxa8/bo8",
        },
      }),
    );

  // Interaction to load the file
  await builder
    .addInteraction()
    .uponReceiving("a request to get the shared document file as recipient")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/${documentId}/files/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b`,
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `./tests/images/encrypted/${documentId}/files/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b`,
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

      // The image should appear in the chat stream!
      const sharedDocImage = page.locator(".shared-document img").first();
      await expect(sharedDocImage).toBeVisible({ timeout: 5000 });

      await page.unrouteAll({ behavior: "ignoreErrors" });
    });
});
