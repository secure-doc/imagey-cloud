import { MatchersV3 } from "@pact-foundation/pact";
import type { Page } from "@playwright/test";
import type { documentService } from "../../src/document/DocumentService";

declare global {
  interface Window {
    documentService: typeof documentService;
  }
}

import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  aesGcmEncrypt,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  loginAsMary,
  mockChatDocument,
  prepareMarysChatsDocument,
  prepareMarysChat,
  prepareMarysDocumentsWithFolder,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysLogin,
  pactMessageTimestamp,
  provider,
  runningPactRequests,
  sentMessageBody,
  setupMockServer,
  messageId,
  TestData,
  ALICE_ID,
  LAURA_ID,
  MARY_ID,
} from "./setup";

const FOLDER_ID = "90838b2c-cea8-4d0c-85eb-9937cda788fc";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

// Mary has one contact, Laura, whose chat she owns. The chats document is read twice - by the
// activity page and by the share dialog - and both reads must decrypt with the same key.
async function prepareMarysFolderShare() {
  const chatsId = TestData.mary.settings!.chats;
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const contacts = [{ userId: LAURA_ID, chatId: "chat-laura", owner: MARY_ID }];
  await prepareMarysChatsDocument(contacts, undefined, chatsDocumentKey);
  await prepareMarysChatsDocument(contacts, undefined, chatsDocumentKey);
  await mockChatDocument({
    ownerEmail: MARY_ID,
    chatId: "chat-laura",
    chatsId,
    chatsDocumentKey,
  });
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get contact requests before sharing")
    .withRequest("GET", `/users/${MARY_ID}/contact-requests`, (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
  await prepareMarysDocumentsWithFolder(FOLDER_ID);

  provider
    .addInteraction()
    .uponReceiving("a request of mary to grant laura a key on her folder")
    .withRequest("POST", `/users/${MARY_ID}/documents/${FOLDER_ID}/keys`, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody({
        issuer: LAURA_ID,
        kid: LAURA_ID,
        sharedKey: MatchersV3.string("dummy-shared-key"),
      }),
    )
    .willRespondWith(200);
  provider
    .addInteraction()
    .uponReceiving("a request of mary to tell laura about the shared folder")
    .withRequest(
      "POST",
      `/users/${MARY_ID}/documents/chat-laura/messages`,
      (r) => r.headers({ "Content-Type": "text/plain" }),
    )
    .willRespondWith(201, (r) =>
      r
        .headers({
          Location: MatchersV3.string(
            `/users/${MARY_ID}/documents/chat-laura/messages/${messageId(951)}`,
          ),
        })
        .jsonBody(sentMessageBody(951)),
    );
  return provider
    .addInteraction()
    .uponReceiving("a request of mary to record the share in her folder")
    .withRequest("PUT", `/users/${MARY_ID}/documents/${FOLDER_ID}`, (r) =>
      r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"folder-etag-shared"') }),
    );
}

async function openShareDialog(page: Page) {
  await page.getByRole("link", { name: "Images" }).click();
  const folderElem = page.getByAltText("My Vacation");
  await expect(folderElem).toBeVisible();
  await folderElem.click({ force: true });
  await expect(page.locator("button.circle.extra")).toBeVisible();
  await page.locator("*[aria-label='add-menu']").click();
  await page.getByText("Share folder", { exact: true }).click();
  await page.getByLabel("Contact").selectOption({ label: "Laura" });
}

test("mary shares a folder with laura read-only", async ({ page }) => {
  await prepareMarysLogin(page);
  // Shared read-only (again): a right given before is taken away.
  provider
    .addInteraction()
    .given("Mary has shared her folder with laura")
    .uponReceiving("a request of mary to take laura's right to contribute away")
    .withRequest(
      "DELETE",
      `/users/${MARY_ID}/documents/${FOLDER_ID}/contributions/${LAURA_ID}`,
    )
    .willRespondWith(204);
  const builder = await prepareMarysFolderShare();

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await openShareDialog(page);

    const shared = page.waitForResponse(
      (r) => r.request().method() === "PUT" && r.url().endsWith(FOLDER_ID),
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await shared;

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("mary shares a folder with laura with contributions", async ({ page }) => {
  await prepareMarysLogin(page);
  provider
    .addInteraction()
    .given("Mary has shared her folder with laura")
    .uponReceiving("a request of mary to let laura contribute to her folder")
    .withRequest(
      "PUT",
      `/users/${MARY_ID}/documents/${FOLDER_ID}/contributions/${LAURA_ID}`,
    )
    .willRespondWith(204);
  const builder = await prepareMarysFolderShare();

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await openShareDialog(page);

    await page.getByLabel("May add content").check({ force: true });
    await expect(
      page.getByText(
        "People with this right can add content to this folder and all folders in it, and change their lists.",
      ),
    ).toBeVisible();

    const shared = page.waitForResponse(
      (r) => r.request().method() === "PUT" && r.url().endsWith(FOLDER_ID),
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await shared;

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

// The key chat-mary's chat key is wrapped with in the fixtures (setup.ts KNOWN_CHAT_KEY).
const KNOWN_CHAT_KEY: JsonWebKey = {
  key_ops: ["encrypt", "decrypt"],
  ext: true,
  alg: "A256GCM",
  kty: "oct",
  k: "rHlLiQjRuBoEcZCWwG6VuYbgcuiJGN4mmohJn5MHpAU",
};

test("mary opens a folder alice shared with her", async ({ page }) => {
  const SHARED_FOLDER_ID = "5a1c0000-0000-4000-8000-000000000001";
  const folderKey = await generateAesGcmKeyJwk();
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const builder = await prepareMarysChat(ALICE_ID);

  const message = await aesGcmEncrypt(
    KNOWN_CHAT_KEY,
    new TextEncoder().encode(
      JSON.stringify({
        type: "shared-folder",
        documentId: SHARED_FOLDER_ID,
        owner: ALICE_ID,
        name: "Trip",
        contributions: false,
      }),
    ),
  );
  provider
    .addInteraction()
    .given("Mary has an invitation to alice's group in her chat with alice")
    .uponReceiving("a request to receive a shared folder message")
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/chat-mary/messages`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string(messageId(902)),
          timestamp: pactMessageTimestamp(902),
          sender: ALICE_ID,
          content: MatchersV3.string(message.toString("base64")),
        },
      ]),
    );
  provider
    .addInteraction()
    .given("Mary has an invitation to alice's group in her chat with alice")
    .uponReceiving("a request to receive more messages after a shared folder")
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/chat-mary/messages`,
      (r) => {
        r.query({ sinceId: messageId(902) });
        r.headers({ Prefer: "wait=30" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Alice's folder with one file in it, readable by mary through the key alice filed for her.
  const folderContent = await aesGcmEncrypt(
    folderKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: SHARED_FOLDER_ID,
        name: "Trip",
        type: "folder",
        documents: [
          {
            documentId: "5a1c0000-0000-4000-8000-000000000002",
            name: "notes.txt",
            type: "file",
            mimeType: "text/plain",
            sharedKey: { sharedKey: "unused" },
          },
        ],
      }),
    ),
  );
  for (const description of [
    "a request of mary to take over the folder alice shared",
    "a request of mary to open the folder alice shared",
  ]) {
    provider
      .addInteraction()
      .given("Alice has shared a folder with mary")
      .uponReceiving(description)
      .withRequest(
        "GET",
        `/users/${ALICE_ID}/documents/${SHARED_FOLDER_ID}`,
        (r) => r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(200, (r) =>
        r.body("application/octet-stream", folderContent),
      );
  }
  const wrappedFolderKey = await encryptKeyEnvelope(folderKey, KNOWN_CHAT_KEY);
  provider
    .addInteraction()
    .given("Alice has shared a folder with mary")
    .uponReceiving("a request of mary to get her key for the shared folder")
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/${SHARED_FOLDER_ID}/keys/${MARY_ID}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        sharedKey: MatchersV3.string(wrappedFolderKey),
      }),
    );
  provider
    .addInteraction()
    .uponReceiving("a request of mary to add the shared folder to her chats")
    .withRequest(
      "PUT",
      `/users/${MARY_ID}/documents/${TestData.mary.settings!.chats}`,
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"chats-etag-shared-folder"') }),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByText("Alice", { exact: true }).first().click();
    await expect(page.getByText("Shared folder: Trip")).toBeVisible();
    await page.getByRole("button", { name: "Open" }).click();

    // The folder is shown, read-only: its content, but nothing to add.
    await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
    await expect(page.locator("*[aria-label='add-menu']")).toHaveCount(0);
    await expect(page.locator("button.circle.extra")).toHaveCount(0);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("the folders shared with mary are listed under 'Shared with me' and open from there", async ({
  page,
}) => {
  const SHARED_FOLDER_ID = "5a1c0000-0000-4000-8000-000000000003";
  const folderKey = await generateAesGcmKeyJwk();
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  // Read by the activity page, then by the list.
  const sharedFolders = [
    {
      documentId: SHARED_FOLDER_ID,
      owner: ALICE_ID,
      name: "Trip",
      folderKey,
      contributions: false,
    },
  ];
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  for (let i = 0; i < 2; i++) {
    await prepareMarysChatsDocument(
      [],
      "mary has no contacts",
      chatsDocumentKey,
      undefined,
      sharedFolders,
    );
  }
  provider
    .addInteraction()
    .given("mary has no contacts")
    .uponReceiving(
      "a request of mary to get contact requests with a shared folder",
    )
    .withRequest("GET", `/users/${MARY_ID}/contact-requests`, (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
  const folderContent = await aesGcmEncrypt(
    folderKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: SHARED_FOLDER_ID,
        name: "Trip",
        type: "folder",
        documents: [],
      }),
    ),
  );
  const builder = provider
    .addInteraction()
    .given("Alice has shared a folder with mary")
    .uponReceiving("a request of mary to open a folder from the shared list")
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/${SHARED_FOLDER_ID}`,
      (r) => r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", folderContent),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Images" }).click();
    await page.getByRole("button", { name: "shared-with-me" }).click();
    await page.getByAltText("Trip").click();

    // An empty folder shared read-only: no upload panel, no add menu.
    await expect(
      page.getByRole("button", { name: "back-button" }),
    ).toBeVisible();
    await expect(page.locator("*[aria-label='add-menu']")).toHaveCount(0);
    await expect(page.locator("button.circle.extra")).toHaveCount(0);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("parseMessageContent reads a shared folder", async ({ page }) => {
  await page.goto("/");
  const parsed = await page.evaluate(() => {
    const folder = (extra: object) =>
      window.remoteApi.parseMessageContent(
        JSON.stringify({
          type: "shared-folder",
          documentId: "f",
          owner: "o",
          name: "Trip",
          ...extra,
        }),
      );
    return {
      readOnly: folder({}),
      contributions: folder({ contributions: true }),
      foreign: folder({ origin: "https://other.test/" }),
      nameMissing: window.remoteApi.parseMessageContent(
        JSON.stringify({ type: "shared-folder", documentId: "f", owner: "o" }),
      ),
      badOrigin: folder({ origin: "nonsense" }),
    };
  });

  expect(parsed.readOnly).toEqual({
    type: "shared-folder",
    documentId: "f",
    owner: "o",
    name: "Trip",
    contributions: false,
  });
  expect(parsed.contributions).toMatchObject({ contributions: true });
  expect(parsed.foreign).toMatchObject({ origin: "https://other.test" });
  expect(parsed.nameMissing.type).toBe("text");
  expect(parsed.badOrigin.type).toBe("text");
});

test("mary adds a document to a folder alice opened for contributions", async ({
  page,
}) => {
  const folderKey = await generateAesGcmKeyJwk();
  const builder = provider
    .addInteraction()
    .given("Alice has opened a folder for contributions")
    .uponReceiving("a request of mary to add a document to alice's folder")
    .withRequest("POST", `/users/${MARY_ID}/documents`, (r) => {
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=.*",
        ),
      });
    })
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          `/users/${MARY_ID}/documents/new-contribution`,
        ),
        "Access-Control-Expose-Headers": "Location, ETag, Last-Modified",
        ETag: MatchersV3.string('"alices-folder-after"'),
      }),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.goto("/");

    const result = await page.evaluate(
      async ({ folderKey, alice, mary }) =>
        window.documentService.storeDocument(
          mary,
          new File(["hello"], "notes.txt", { type: "text/plain" }),
          {
            documentId: "alices-open-folder",
            name: "Trip",
            owner: alice,
            revision: '"alices-folder"',
            key: folderKey,
            type: "folder",
            documents: [],
          },
          folderKey,
        ),
      { folderKey, alice: ALICE_ID, mary: MARY_ID },
    );

    // The new entry says whose tree the document is in.
    expect(result.parentFolderDocuments).toHaveLength(1);
    expect(result.parentFolderDocuments[0].owner).toBe(MARY_ID);
    expect(result.parentFolderRevision).toBe('"alices-folder-after"');
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
