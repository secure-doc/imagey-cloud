import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import {
  aesGcmEncrypt,
  clearLocalStorage,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  inputMarysPassword,
  routeMarysAuth,
  setupMarysDevice,
  TestData,
  ALICE_ID,
  LAURA_ID,
  MARY_ID,
} from "./setup";

// The dialog for sharing a folder and the shared-folder message in a chat, in the situations the
// contract tests do not stage: no contacts, a failing load, a failing share, a contact on
// another server, and a folder that cannot be opened. Served from fixtures generated here.

const VACATION = "5a1c0000-0000-4000-8000-0000000000b1";
const TRIP = "5a1c0000-0000-4000-8000-0000000000b2";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

const json = (value: object) => new TextEncoder().encode(JSON.stringify(value));

interface Fixture {
  chatsKey: JsonWebKey;
  chats: { status: number; contacts: object[]; sharedFolders: object[] };
  puts: string[];
}

// Mary's chats document (as the test states it) and her documents folder with one folder in it.
async function serveMarys(
  page: Page,
  // Added to the content of the Vacation folder, e.g. the shares recorded in it.
  vacationExtra: object = {},
): Promise<Fixture> {
  const settings = TestData.mary.settings!;
  const fixture: Fixture = {
    chatsKey: await generateAesGcmKeyJwk(),
    chats: { status: 200, contacts: [], sharedFolders: [] },
    puts: [],
  };
  const rootKey = await generateAesGcmKeyJwk();
  const vacationKey = await generateAesGcmKeyJwk();
  const serve = (pattern: string, body: Buffer, etag = '"etag"') =>
    page.route(pattern, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/octet-stream",
            headers: { ETag: etag },
            body,
          })
        : route.fallback(),
    );

  await page.route(`**/users/${MARY_ID}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${settings.chats}`,
    async (route) => {
      if (route.request().method() === "PUT") {
        fixture.puts.push("chats");
        return route.fulfill({ status: 204, headers: { ETag: '"chats-2"' } });
      }
      if (fixture.chats.status !== 200) {
        return route.fulfill({ status: fixture.chats.status });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        headers: { ETag: '"chats-1"' },
        body: await aesGcmEncrypt(
          fixture.chatsKey,
          json({
            type: "chatList",
            name: "Chats",
            contacts: fixture.chats.contacts,
            groups: [],
            sharedFolders: fixture.chats.sharedFolders,
          }),
        ),
      });
    },
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${settings.chats}/keys/${MARY_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: {
          sharedKey: await encryptKeyEnvelope(
            fixture.chatsKey,
            TestData.mary.settingsKey!,
          ),
        },
      }),
  );

  await serve(
    `**/users/${MARY_ID}/documents/${settings.documents}`,
    await aesGcmEncrypt(
      rootKey,
      json({
        documentId: settings.documents,
        name: "Documents",
        type: "folder",
        documents: [
          {
            documentId: VACATION,
            name: "Vacation",
            type: "folder",
            sharedKey: {
              sharedKey: await encryptKeyEnvelope(vacationKey, rootKey),
            },
          },
        ],
      }),
    ),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${settings.documents}/keys/${MARY_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: {
          sharedKey: await encryptKeyEnvelope(
            rootKey,
            TestData.mary.settingsKey!,
          ),
        },
      }),
  );
  await serve(
    `**/users/${MARY_ID}/documents/${VACATION}`,
    await aesGcmEncrypt(
      vacationKey,
      json({
        documentId: VACATION,
        name: "Vacation",
        type: "folder",
        documents: [],
        ...vacationExtra,
      }),
    ),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${VACATION}/keys/${settings.documents}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(vacationKey, rootKey) },
      }),
  );
  return fixture;
}

async function loginAt(page: Page, path: string) {
  await setupMarysDevice(page);
  await routeMarysAuth(page);
  await page.goto(path);
  await inputMarysPassword(page);
}

async function openShareDialog(page: Page) {
  await page.getByAltText("Vacation").click({ force: true });
  await expect(page.locator("button.circle.extra")).toBeVisible();
  await page.locator("*[aria-label='add-menu']").click();
  await page.getByText("Share folder", { exact: true }).click();
}

const laura = {
  userId: LAURA_ID,
  chatId: "chat-laura",
  owner: MARY_ID,
  name: "Laura",
  profileRevision: "0",
};

test("the share dialog tells when there are no contacts", async ({ page }) => {
  await serveMarys(page);
  await loginAt(page, "/images");
  await openShareDialog(page);

  await expect(page.getByText("You have no contacts yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the share dialog tells when the contacts cannot be loaded", async ({
  page,
}) => {
  const fixture = await serveMarys(page);
  await loginAt(page, "/images");
  // Only the dialog's own read fails.
  fixture.chats.status = 500;
  await openShareDialog(page);

  await expect(page.getByText("Could not load your contacts.")).toBeVisible();
});

test("a share that fails is reported and can be tried again", async ({
  page,
}) => {
  const fixture = await serveMarys(page);
  fixture.chats.contacts = [
    {
      ...laura,
      pending: { chatKey: await generateAesGcmKeyJwk(), publicProfiles: {} },
    },
  ];
  await page.route(`**/users/${MARY_ID}/documents/chat-laura`, (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route(`**/users/${MARY_ID}/documents/${VACATION}/keys`, (route) =>
    route.fulfill({ status: 500 }),
  );
  await loginAt(page, "/images");
  await openShareDialog(page);

  await page.getByLabel("Contact").selectOption({ label: "Laura" });
  await page.getByRole("button", { name: "Share", exact: true }).click();

  await expect(page.getByText("Could not share the folder.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toBeEnabled();
});

test("contributions are not offered for a contact on another server, and without an address nothing is shared", async ({
  page,
}) => {
  const fixture = await serveMarys(page);
  fixture.chats.contacts = [
    {
      ...laura,
      chatOrigin: "https://other.test",
      self: { userId: "mary-there" },
    },
  ];
  await loginAt(page, "/images");
  await openShareDialog(page);

  await page.getByLabel("Contact").selectOption({ label: "Laura" });
  await expect(page.getByLabel("May add content")).toBeDisabled();
  await expect(
    page.getByText(
      "Contributions are not possible for contacts on another server.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(
    page.getByText("There is no address to share with this contact."),
  ).toBeVisible();
});

// --- the message in the chat ------------------------------------------------------------------

async function serveChatWithAlice(
  page: Page,
  messages: object[],
  sharedFolders: object[] = [],
) {
  const fixture = await serveMarys(page);
  const chatKey = await generateAesGcmKeyJwk();
  fixture.chats.contacts = [
    {
      userId: ALICE_ID,
      chatId: "chat-mary",
      owner: ALICE_ID,
      name: "Alice",
      profileRevision: "0",
      pending: { chatKey, publicProfiles: {} },
    },
  ];
  fixture.chats.sharedFolders = sharedFolders;
  await page.route(`**/users/${ALICE_ID}/documents/chat-mary`, (route) =>
    route.fulfill({ status: 404 }),
  );
  const encrypted = await Promise.all(
    messages.map(async (message, index) => ({
      id: `${1_700_000_000_000 + index}-00000000-0000-4000-8000-00000000000${index}`,
      timestamp: new Date(1_700_000_000_000 + index).toISOString(),
      sender: ALICE_ID,
      content: (await aesGcmEncrypt(chatKey, json(message))).toString("base64"),
    })),
  );
  await page.route(
    `**/users/${ALICE_ID}/documents/chat-mary/messages`,
    (route) =>
      route.request().method() === "HEAD"
        ? route.fulfill({ status: 200 })
        : route.fulfill({
            status: 200,
            json: route.request().url().includes("sinceId") ? [] : encrypted,
          }),
  );
  return { fixture, chatKey };
}

const sharedFolderMessage = (extra: object = {}) => ({
  type: "shared-folder",
  documentId: TRIP,
  owner: ALICE_ID,
  name: "Trip",
  contributions: false,
  ...extra,
});

test("a shared folder that cannot be opened is reported with a retry", async ({
  page,
}) => {
  await serveChatWithAlice(page, [sharedFolderMessage()]);
  await page.route(`**/users/${ALICE_ID}/documents/${TRIP}`, (route) =>
    route.fulfill({ status: 500 }),
  );
  await loginAt(page, `/chats/${ALICE_ID}`);

  await expect(page.getByText("Shared folder: Trip")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Could not open the folder.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a shared folder that names an unknown server is not opened", async ({
  page,
}) => {
  await serveChatWithAlice(page, [
    sharedFolderMessage({ origin: "https://evil.test" }),
  ]);
  let asked = false;
  await page.route("https://evil.test/**", (route) => {
    asked = true;
    return route.abort();
  });
  await loginAt(page, `/chats/${ALICE_ID}`);

  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Could not open the folder.")).toBeVisible();
  expect(asked).toBe(false);
});

test("a shared folder that is already in 'Shared with me' opens without being loaded again", async ({
  page,
}) => {
  const tripKey = await generateAesGcmKeyJwk();
  const { fixture } = await serveChatWithAlice(
    page,
    [sharedFolderMessage({ contributions: true })],
    [
      {
        documentId: TRIP,
        owner: ALICE_ID,
        name: "Trip",
        folderKey: tripKey,
        contributions: true,
      },
    ],
  );
  await page.route(`**/users/${ALICE_ID}/documents/${TRIP}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: await aesGcmEncrypt(
        tripKey,
        json({ documentId: TRIP, name: "Trip", type: "folder", documents: [] }),
      ),
    }),
  );
  await loginAt(page, `/chats/${ALICE_ID}`);

  await expect(page.getByText("You may add content.")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).click();

  // Shared with contributions: an empty folder offers the upload.
  await expect(page.locator("button.circle.extra")).toBeVisible();
  expect(fixture.puts).toEqual([]);
});

test("'Shared with me' tells when nothing has been shared yet", async ({
  page,
}) => {
  await serveMarys(page);
  await loginAt(page, "/shared");

  await expect(
    page.getByText("Nothing has been shared with you yet."),
  ).toBeVisible();
});

test("'Shared with me' tells when the shared folders cannot be loaded", async ({
  page,
}) => {
  const fixture = await serveMarys(page);
  fixture.chats.status = 500;
  await loginAt(page, "/shared");

  await expect(
    page.getByText("Could not load the shared folders."),
  ).toBeVisible();
});

test("contributions are not offered for a contact whose home is another server either", async ({
  page,
}) => {
  const fixture = await serveMarys(page);
  // The chat is on this server, the contact lives elsewhere: he reads as a guest.
  fixture.chats.contacts = [
    { ...laura, profileHome: { origin: "https://other.test", userId: "l" } },
  ];
  await loginAt(page, "/images");
  await openShareDialog(page);

  await page.getByLabel("Contact").selectOption({ label: "Laura" });
  await expect(page.getByLabel("May add content")).toBeDisabled();
});

test("the newest message about a folder says what the entry is - an older, narrower one does not change that", async ({
  page,
}) => {
  const tripKey = await generateAesGcmKeyJwk();
  const { fixture } = await serveChatWithAlice(
    page,
    [
      sharedFolderMessage({ contributions: false }),
      sharedFolderMessage({ contributions: true }),
    ],
    [
      {
        documentId: TRIP,
        owner: ALICE_ID,
        name: "Trip",
        folderKey: tripKey,
        contributions: true,
      },
    ],
  );
  await page.route(`**/users/${ALICE_ID}/documents/${TRIP}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: await aesGcmEncrypt(
        tripKey,
        json({ documentId: TRIP, name: "Trip", type: "folder", documents: [] }),
      ),
    }),
  );
  await loginAt(page, `/chats/${ALICE_ID}`);

  // The older message is opened: it shows the newest state.
  await page.getByRole("button", { name: "Open" }).first().click();

  // The entry keeps its contributions: the empty folder still offers the upload.
  await expect(page.locator("button.circle.extra")).toBeVisible();
  expect(fixture.puts).toEqual([]);
});

test("a folder shared again without contributions takes them away from the entry", async ({
  page,
}) => {
  const tripKey = await generateAesGcmKeyJwk();
  const { fixture, chatKey } = await serveChatWithAlice(
    page,
    [
      sharedFolderMessage({ contributions: true }),
      sharedFolderMessage({ contributions: false }),
    ],
    [
      {
        documentId: TRIP,
        owner: ALICE_ID,
        name: "Trip",
        folderKey: tripKey,
        contributions: true,
      },
    ],
  );
  await page.route(`**/users/${ALICE_ID}/documents/${TRIP}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: await aesGcmEncrypt(
        tripKey,
        json({ documentId: TRIP, name: "Trip", type: "folder", documents: [] }),
      ),
    }),
  );
  await page.route(
    `**/users/${ALICE_ID}/documents/${TRIP}/keys/*`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(tripKey, chatKey) },
      }),
  );
  await loginAt(page, `/chats/${ALICE_ID}`);

  await page.getByRole("button", { name: "Open" }).last().click();

  // The entry is rewritten, and the folder is read-only.
  await expect(page.getByText("This folder is empty.")).toBeVisible();
  await expect(page.locator("*[aria-label='add-menu']")).toHaveCount(0);
  expect(fixture.puts).toEqual(["chats"]);
});
