import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  aesGcmEncrypt,
  buildGroupAccessPathForTest,
  clearLocalStorage,
  encryptedDocument,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  loginAsMaryAt,
  routeGeneratedDocument,
  stubMobile,
  TestData,
} from "./setup";
import { ALICE_ID, LAURA_ID, MARY_ID } from "./testdata";

// Download/share for non-image documents (docs/plans/open-documents.md, part
// A): a folder or chat tile for a `file` document, clicked, either downloads
// (desktop) or opens the system share sheet (mobile) - never a blob URL
// loaded as a page in the app's own origin. Loading a folder/document/shared
// document is already covered by folder.test.ts/chat.test.ts's Pact
// contracts, so these tests serve generated fixtures via page.route and only
// verify the client's own behavior.

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

const MARY = MARY_ID;
const LAURA = LAURA_ID;
const ALICE = ALICE_ID;
const ROOT_ID = TestData.mary.settings!.documents;
const CHATS_ID = TestData.mary.settings!.chats;
const ROOT_KEY = TestData.mary.documents[0].key!;
const CHAT_ID = "chat-laura-document";
const GROUP_ID = "77777777-7777-7777-7777-777777777001";
const FILE_ID = "11111111-1111-1111-1111-111111111111";
const CONTENT_ID = "22222222-2222-2222-2222-222222222222";

async function routeContactRequests(page: Page) {
  await page.route(`**/users/${MARY}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
}

// Mary's root folder with a single `file` entry.
async function routeFolderWithFile(
  page: Page,
  { name, mimeType }: { name: string; mimeType: string },
) {
  const fileKey = await generateAesGcmKeyJwk();
  await routeGeneratedDocument(
    page,
    ROOT_ID,
    await encryptedDocument(ROOT_KEY, {
      type: "folder",
      name: "Documents",
      documents: [
        {
          documentId: FILE_ID,
          name,
          type: "file",
          mimeType,
          sharedKey: { sharedKey: await encryptKeyEnvelope(fileKey, ROOT_KEY) },
        },
      ],
    }),
    MARY,
    await encryptKeyEnvelope(ROOT_KEY, TestData.mary.settingsKey!),
  );
  return { fileKey };
}

// Routes the FILE_ID document (as a child of the root folder) plus its
// content, and returns a counter of how many times the content was
// requested (used to check lazy/one-shot loading).
async function routeFileDocument(
  page: Page,
  {
    fileKey,
    name,
    mimeType,
    content,
    type = "file",
  }: {
    fileKey: JsonWebKey;
    name: string;
    mimeType: string;
    content: Buffer;
    type?: "file" | "image";
  },
) {
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type,
      name,
      mimeType,
      size: content.length,
      contentId: CONTENT_ID,
      ...(type === "image"
        ? { smallImageId: CONTENT_ID, mediumImageId: CONTENT_ID }
        : {}),
    }),
    ROOT_ID,
    await encryptKeyEnvelope(fileKey, ROOT_KEY),
  );
  let requests = 0;
  await page.route(
    `**/users/${MARY}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    async (route) => {
      requests++;
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: await aesGcmEncrypt(fileKey, content),
      });
    },
  );
  return { contentRequests: () => requests };
}

// Mary's chat with Laura (owned by Mary) sharing one `file` document.
async function routeChatSharingFile(
  page: Page,
  {
    fileKey,
    name,
    mimeType,
    content,
  }: { fileKey: JsonWebKey; name: string; mimeType: string; content: Buffer },
) {
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();
  const settingsKey = TestData.mary.settingsKey!;

  // SharedDocumentMessage resolves Mary's OWN share through her root
  // folder's key (isOwner branch), same as useKey(documentsId) anywhere
  // else - only the key entry is needed, not the folder's own content.
  await page.route(
    `**/users/${MARY}/documents/${ROOT_ID}/keys/${MARY}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(ROOT_KEY, settingsKey) },
      }),
  );
  await routeGeneratedDocument(
    page,
    CHATS_ID,
    await encryptedDocument(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts: [
        {
          userId: LAURA,
          chatId: CHAT_ID,
          owner: MARY,
          name: "Laura",
          profileRevision: "0",
        },
      ],
    }),
    MARY,
    await encryptKeyEnvelope(chatsKey, settingsKey),
  );
  await routeGeneratedDocument(
    page,
    CHAT_ID,
    await encryptedDocument(chatKey, {
      type: "chat",
      name: "Chat",
      publicProfiles: {},
    }),
    CHATS_ID,
    await encryptKeyEnvelope(chatKey, chatsKey),
  );
  // Mary is the sender/owner of this share, so SharedDocumentMessage reaches
  // it through her OWN root folder (isOwner branch), exactly like a folder
  // tile - not through the chat key, which only non-owner recipients use.
  await routeFileDocument(page, { fileKey, name, mimeType, content });

  const message = (
    await encryptedDocument(chatKey, {
      type: "shared-document",
      documentId: FILE_ID,
      owner: MARY,
    })
  ).toString("base64");
  await page.route(
    new RegExp(`/users/${MARY}/documents/${CHAT_ID}/messages`),
    (route) =>
      route.fulfill({
        status: 200,
        json: route.request().url().includes("sinceId")
          ? []
          : [{ id: "msg-1", sender: MARY, content: message }],
      }),
  );
}

// A group Alice owns, that Mary is a member of (her "chats" document already
// carries the cached GroupEntry.groupKey from joining, ADR 0019 decision 3 -
// no 1:1 chat-key detour needed to open it), with one message sharing a
// `file` document Alice owns. Mary - a member and not the file's owner -
// reaches it via the two-hop Access-Path (FolderContext.buildGroupAccessPath)
// instead of a direct grant; `contentAccessPaths` records the Access-Path
// header sent with each content request, to check it round-trips correctly.
async function routeGroupSharingFile(
  page: Page,
  {
    fileKey,
    name,
    mimeType,
    content,
  }: { fileKey: JsonWebKey; name: string; mimeType: string; content: Buffer },
) {
  const chatsKey = await generateAesGcmKeyJwk();
  const groupKey = await generateAesGcmKeyJwk();
  const settingsKey = TestData.mary.settingsKey!;

  await routeGeneratedDocument(
    page,
    CHATS_ID,
    await encryptedDocument(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts: [],
      groups: [{ groupId: GROUP_ID, owner: ALICE, name: "Team", groupKey }],
    }),
    MARY,
    await encryptKeyEnvelope(chatsKey, settingsKey),
  );
  // loadGroupContent (a member, not the owner) fetches only the group's
  // content - its key is already cached from the GroupEntry above, so no
  // keys/{kid} request is made for it.
  const groupContent = await encryptedDocument(groupKey, {
    type: "group",
    name: "Team",
    members: [ALICE, MARY],
    publicProfiles: {},
  });
  await page.route(`**/users/${ALICE}/documents/${GROUP_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: groupContent,
    }),
  );

  const contentAccessPaths: (string | null)[] = [];
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name,
      mimeType,
      size: content.length,
      contentId: CONTENT_ID,
    }),
    GROUP_ID,
    await encryptKeyEnvelope(fileKey, groupKey),
    ALICE,
  );
  await page.route(
    `**/users/${ALICE}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    async (route) => {
      contentAccessPaths.push(route.request().headers()["access-path"] ?? null);
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: await aesGcmEncrypt(fileKey, content),
      });
    },
  );

  const message = (
    await encryptedDocument(groupKey, {
      type: "shared-document",
      documentId: FILE_ID,
      owner: ALICE,
    })
  ).toString("base64");
  await page.route(
    new RegExp(`/users/${ALICE}/documents/${GROUP_ID}/messages`),
    (route) =>
      route.fulfill({
        status: 200,
        json: route.request().url().includes("sinceId")
          ? []
          : [{ id: "msg-1", sender: ALICE, content: message }],
      }),
  );
  return { contentAccessPaths: () => contentAccessPaths };
}

test("a file tile in a folder downloads on click", async ({ page }) => {
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  const content = Buffer.from("hello from note.txt");
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content,
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await expect(page.getByText("Error loading note.txt")).toBeHidden();
  await expect(page.getByLabel("note.txt")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("note.txt").click(),
  ]);
  expect(download.suggestedFilename()).toBe("note.txt");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(chunk as Buffer);
  }
  expect(Buffer.concat(chunks).toString()).toBe("hello from note.txt");
});

test("an HTML file downloads its original content instead of being rendered", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithFile(page, {
    name: "page.html",
    mimeType: "text/html",
  });
  const content = Buffer.from("<script>window.__pwn = true;</script>");
  await routeFileDocument(page, {
    fileKey,
    name: "page.html",
    mimeType: "text/html",
    content,
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await expect(page.getByLabel("page.html")).toBeVisible();

  const urlBefore = page.url();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("page.html").click(),
  ]);
  expect(download.suggestedFilename()).toBe("page.html");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(chunk as Buffer);
  }
  expect(Buffer.concat(chunks).toString()).toBe(content.toString());
  // Never rendered as a page: no new tab, same URL, and the script never ran.
  expect(page.context().pages().length).toBe(1);
  expect(page.url()).toBe(urlBefore);
  expect(
    await page.evaluate(() => (window as unknown as { __pwn?: boolean }).__pwn),
  ).toBeUndefined();
});

test("a shared file in a 1:1 chat downloads on click", async ({ page }) => {
  const fileKey = await generateAesGcmKeyJwk();
  const content = Buffer.from("shared note content");
  await routeChatSharingFile(page, {
    fileKey,
    name: "shared.txt",
    mimeType: "text/plain",
    content,
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Chats" }).first().click();
  await page.getByText("Laura", { exact: true }).first().click();
  await expect(page.getByLabel("shared.txt")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("shared.txt").click(),
  ]);
  expect(download.suggestedFilename()).toBe("shared.txt");
});

test("a shared file in a group chat downloads via the two-hop Access-Path", async ({
  page,
}) => {
  const fileKey = await generateAesGcmKeyJwk();
  const content = Buffer.from("shared group content");
  const { contentAccessPaths } = await routeGroupSharingFile(page, {
    fileKey,
    name: "team-notes.txt",
    mimeType: "text/plain",
    content,
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Chats" }).first().click();
  await page.getByText("Team", { exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("team-notes.txt")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("team-notes.txt").click(),
  ]);
  expect(download.suggestedFilename()).toBe("team-notes.txt");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(chunk as Buffer);
  }
  expect(Buffer.concat(chunks).toString()).toBe("shared group content");

  // The Access-Path header sent for the content fetch must be exactly the
  // two-hop chain FolderContext.buildGroupAccessPath produces - not merely
  // "some header", which just having a working download wouldn't confirm.
  expect(contentAccessPaths()).toEqual([
    buildGroupAccessPathForTest(FILE_ID, ALICE, GROUP_ID, ALICE),
  ]);
});

test("a wrong document type behind a file tile shows an error, not a crash", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithFile(page, {
    name: "oops.bin",
    mimeType: "application/octet-stream",
  });
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "image",
      name: "oops.bin",
      mimeType: "image/jpeg",
      size: 1,
      contentId: CONTENT_ID,
      smallImageId: CONTENT_ID,
      mediumImageId: CONTENT_ID,
    }),
    ROOT_ID,
    await encryptKeyEnvelope(fileKey, ROOT_KEY),
  );
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("oops.bin").click();

  await expect(page.getByText("Could not open oops.bin")).toBeVisible();
});

test("a load error shows an error snackbar and does not download", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithFile(page, {
    name: "broken.txt",
    mimeType: "text/plain",
  });
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name: "broken.txt",
      mimeType: "text/plain",
      size: 1,
      contentId: CONTENT_ID,
    }),
    ROOT_ID,
    await encryptKeyEnvelope(fileKey, ROOT_KEY),
  );
  await page.route(
    `**/users/${MARY}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    (route) => route.fulfill({ status: 404 }),
  );
  await routeContactRequests(page);

  let downloads = 0;
  page.on("download", () => downloads++);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("broken.txt").click();

  await expect(page.getByText("Could not open broken.txt")).toBeVisible();
  expect(downloads).toBe(0);
});

test("clicking a busy file tile twice triggers only one download", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithFile(page, {
    name: "slow.txt",
    mimeType: "text/plain",
  });
  const content = Buffer.from("slow content");
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name: "slow.txt",
      mimeType: "text/plain",
      size: content.length,
      contentId: CONTENT_ID,
    }),
    ROOT_ID,
    await encryptKeyEnvelope(fileKey, ROOT_KEY),
  );
  await page.route(
    `**/users/${MARY}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: await aesGcmEncrypt(fileKey, content),
      });
    },
  );
  await routeContactRequests(page);

  let downloads = 0;
  page.on("download", () => downloads++);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  const tile = page.getByLabel("slow.txt");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-busy", "true");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-busy", "false", {
    timeout: 10_000,
  });
  expect(downloads).toBe(1);
});

test("mobile with the share API shares instead of downloading", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "ok" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  let downloads = 0;
  page.on("download", () => downloads++);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("note.txt").click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __shared?: unknown[] }).__shared?.length ?? 0,
      ),
    )
    .toBe(1);
  const shared = await page.evaluate(
    () =>
      (window as unknown as { __shared: { name: string; type: string }[] })
        .__shared,
  );
  expect(shared[0].name).toBe("note.txt");
  expect(shared[0].type).toBe("text/plain");
  expect(downloads).toBe(0);
});

test("mobile share cancelled by the user does not fall back to a download", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "AbortError" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  let downloads = 0;
  page.on("download", () => downloads++);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  const tile = page.getByLabel("note.txt");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-busy", "false", {
    timeout: 10_000,
  });

  expect(downloads).toBe(0);
  await expect(page.locator("dialog.active")).toBeHidden();
});

test("mobile with an expired gesture shows a dialog whose Open re-shares without reloading", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "NotAllowedOnce" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  const { contentRequests } = await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("note.txt").click();

  await expect(page.getByText("note.txt is ready")).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __shared?: unknown[] }).__shared?.length ?? 0,
      ),
    )
    .toBe(1);
  expect(contentRequests()).toBe(1);
});

test("cancelling the expired-gesture dialog shares nothing", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "NotAllowedOnce" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("note.txt").click();

  await expect(page.getByText("note.txt is ready")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByText("note.txt is ready")).toBeHidden();
  expect(
    await page.evaluate(
      () => (window as unknown as { __shared?: unknown[] }).__shared,
    ),
  ).toBeUndefined();
});

test("a gesture that stays blocked even on retry shows the error snackbar", async ({
  page,
}) => {
  // Unlike "NotAllowedOnce", this rejects every call - the dialog's "Open"
  // button re-invokes share() and gets NotAllowedError again.
  await stubMobile(page, { coarse: true, share: "NotAllowedError" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("note.txt").click();

  await expect(page.getByText("note.txt is ready")).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();

  await expect(page.getByText("note.txt is ready")).toBeHidden();
  await expect(page.getByText("Could not open note.txt")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __shared?: unknown[] }).__shared,
    ),
  ).toBeUndefined();
});

test("an unexpected share error falls back to downloading", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "TypeError" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("note.txt").click(),
  ]);
  expect(download.suggestedFilename()).toBe("note.txt");
});

test("mobile without the share API falls back to downloading", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "none" });
  const { fileKey } = await routeFolderWithFile(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name: "note.txt",
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("note.txt").click(),
  ]);
  expect(download.suggestedFilename()).toBe("note.txt");
});

test("a file name with XML-sensitive characters renders a valid tile", async ({
  page,
}) => {
  const name = "a<b&c.txt";
  const { fileKey } = await routeFolderWithFile(page, {
    name,
    mimeType: "text/plain",
  });
  await routeFileDocument(page, {
    fileKey,
    name,
    mimeType: "text/plain",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  const tile = page.getByLabel(name);
  await expect(tile).toBeVisible();
  expect(
    await tile
      .locator("img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
});

test("a file name with an emoji straddling the truncation boundary does not crash the app", async ({
  page,
}) => {
  // "Urlaub am Meer" is exactly 14 characters, so the emoji (a surrogate
  // pair in UTF-16) sits right at the 15-character cut - the exact case
  // that used to split it into a lone surrogate and make encodeURIComponent
  // throw "URIError: URI malformed" (iconTile.ts's tileLabel used to
  // truncate by UTF-16 code unit via String.substring instead of by code
  // point).
  const name = "Urlaub am Meer😀.mp4";
  const { fileKey } = await routeFolderWithFile(page, {
    name,
    mimeType: "video/mp4",
  });
  await routeFileDocument(page, {
    fileKey,
    name,
    mimeType: "video/mp4",
    content: Buffer.from("hi"),
  });
  await routeContactRequests(page);

  const pageErrors: Error[] = [];
  page.on("pageerror", (e) => pageErrors.push(e));

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  const tile = page.getByLabel(name);
  await expect(tile).toBeVisible();
  expect(
    await tile
      .locator("img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  // The rest of the app bar/navigation still rendered - a crash here would
  // have taken down the whole page, not just this tile.
  await expect(page.getByRole("link", { name: "Chats" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
