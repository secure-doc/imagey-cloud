import { Page } from "@playwright/test";
import * as fs from "fs";
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
} from "./setup";

// Navigation flows around the image detail view (/images/:id) that need a
// folder/chat layout the shared Pact fixtures don't have (an image inside a
// sub-folder, a chat that shares an image). The requests of the underlying
// operations (loading a folder, a shared document, a chat) are covered by the
// Pact contracts in folder.test.ts / chat.test.ts, so these tests serve
// generated fixtures through Playwright routing and only verify the client's
// behavior: which page is shown and where "back" leads.

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

const MARY = "d20cf443-4f96-418f-a957-c8cbef8677c3";
const ROOT_ID = TestData.mary.settings!.documents;
const CHATS_ID = TestData.mary.settings!.chats;
const ROOT_KEY = TestData.mary.documents[0].key!;
const BEACH_ID = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3";
const BEACH_KEY = TestData.mary.documents[2].key!;
const BEACH_MEDIUM_ID = "7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0";
const BEACH_NAME = "beach-1836467_1920.jpg";
const FOLDER_ID = "90838b2c-cea8-4d0c-85eb-9937cda788fc";
const LAURA = "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6";
const CHAT_ID = "chat-laura";

function encrypted(key: JsonWebKey, content: object) {
  return aesGcmEncrypt(key, new TextEncoder().encode(JSON.stringify(content)));
}

async function routeDocument(
  page: Page,
  id: string,
  content: Buffer,
  keyId: string,
  wrappedKey: string,
  owner: string = MARY,
) {
  await page.route(`**/users/${owner}/documents/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: content,
    }),
  );
  await page.route(`**/users/${owner}/documents/${id}/keys/${keyId}`, (route) =>
    route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
  );
}

// The beach image (a child of the root folder, as in the Pact fixtures) with
// its small and medium file.
async function routeBeachImage(page: Page) {
  await page.route(`**/users/${MARY}/documents/${BEACH_ID}`, (route) =>
    route.fulfill({
      status: 200,
      path: `tests/images/encrypted/${BEACH_ID}/document.enc`,
    }),
  );
  await page.route(
    `**/users/${MARY}/documents/${BEACH_ID}/keys/${ROOT_ID}`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${BEACH_ID}/keys/${ROOT_ID}.json`,
      }),
  );
  await page.route(
    new RegExp(`/users/${MARY}/documents/${BEACH_ID}/files/[^/]+$`),
    (route) => {
      const file = route.request().url().split("/").pop();
      return route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${BEACH_ID}/files/${file}`,
      });
    },
  );
  await page.route(
    `**/users/${MARY}/documents/${ROOT_ID}/keys/${MARY}`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${ROOT_ID}/keys/${MARY}.json`,
      }),
  );
  await page.route(`**/users/${MARY}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
}

// Mary's chat with Laura (owned by Mary, ADR 0015) containing one message that
// shares the beach image.
async function routeChatSharingBeachImage(page: Page) {
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();
  const settingsKey = TestData.mary.settingsKey!;

  await routeDocument(
    page,
    CHATS_ID,
    await encrypted(chatsKey, {
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
  await routeDocument(
    page,
    CHAT_ID,
    await encrypted(chatKey, {
      type: "chat",
      name: "Chat",
      publicProfiles: {},
    }),
    CHATS_ID,
    await encryptKeyEnvelope(chatKey, chatsKey),
  );

  const message = (
    await encrypted(chatKey, {
      type: "shared-document",
      documentId: BEACH_ID,
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

// Laura's chat with Mary (owned by Laura) in which Laura shared the beach image
// from her own tree: Mary reaches the image through her chat key entry.
async function routeChatWithBeachImageSharedByLaura(page: Page) {
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();

  await routeDocument(
    page,
    CHATS_ID,
    await encrypted(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts: [
        {
          userId: LAURA,
          chatId: CHAT_ID,
          owner: LAURA,
          name: "Laura",
          profileRevision: "0",
        },
      ],
    }),
    MARY,
    await encryptKeyEnvelope(chatsKey, TestData.mary.settingsKey!),
  );
  await routeDocument(
    page,
    CHAT_ID,
    await encrypted(chatKey, {
      type: "chat",
      name: "Chat",
      publicProfiles: {},
    }),
    MARY,
    await encryptKeyEnvelope(chatKey, chatsKey),
    LAURA,
  );
  await routeDocument(
    page,
    BEACH_ID,
    fs.readFileSync(`tests/images/encrypted/${BEACH_ID}/document.enc`),
    MARY,
    await encryptKeyEnvelope(BEACH_KEY, chatKey),
    LAURA,
  );
  await page.route(
    new RegExp(`/users/${LAURA}/documents/${BEACH_ID}/files/[^/]+$`),
    (route) => {
      const file = route.request().url().split("/").pop();
      return route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${BEACH_ID}/files/${file}`,
      });
    },
  );
  await page.route(`**/users/${MARY}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
}

async function login(page: Page, path: string) {
  await setupMarysDevice(page);
  await routeMarysAuth(page);
  await page.goto(path);
  await inputMarysPassword(page);
}

test("open an image from a sub-folder in the detail view and go back into it", async ({
  page,
}) => {
  // The back button is only shown on small screens
  await page.setViewportSize({ width: 412, height: 915 });

  const folderKey = await generateAesGcmKeyJwk();
  await routeBeachImage(page);
  await routeDocument(
    page,
    ROOT_ID,
    await encrypted(ROOT_KEY, {
      type: "folder",
      name: "Documents",
      documents: [
        {
          documentId: FOLDER_ID,
          name: "My Vacation",
          type: "folder",
          sharedKey: {
            sharedKey: await encryptKeyEnvelope(folderKey, ROOT_KEY),
          },
        },
      ],
    }),
    MARY,
    await encryptKeyEnvelope(ROOT_KEY, TestData.mary.settingsKey!),
  );
  await routeDocument(
    page,
    FOLDER_ID,
    await encrypted(folderKey, {
      type: "folder",
      name: "My Vacation",
      documents: [
        {
          documentId: BEACH_ID,
          name: BEACH_NAME,
          type: "image",
          mimeType: "image/jpeg",
          mediumImageId: BEACH_MEDIUM_ID,
          sharedKey: {
            sharedKey: await encryptKeyEnvelope(BEACH_KEY, folderKey),
          },
        },
      ],
    }),
    ROOT_ID,
    await encryptKeyEnvelope(folderKey, ROOT_KEY),
  );

  await login(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByAltText("My Vacation").click();
  await expect(page).toHaveURL(`/documents/${FOLDER_ID}`);
  await page.getByAltText(BEACH_NAME).click();

  // The detail view of the image
  await expect(page).toHaveURL(`/images/${BEACH_ID}?folder=${FOLDER_ID}`);
  await expect(page.locator("main img")).toHaveCount(1);
  await expect(page.getByAltText(BEACH_NAME)).toBeVisible();

  // Back leads into the sub-folder, not into the root folder
  await page.getByLabel("back-button").click();
  await expect(page).toHaveURL(`/documents/${FOLDER_ID}`);
  await expect(page.getByAltText(BEACH_NAME)).toBeVisible();
  await expect(page.getByAltText("My Vacation")).toBeHidden();
});

test("open a shared image from the chat in the detail view and go back to the chat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await routeBeachImage(page);
  await routeChatSharingBeachImage(page);

  await login(page, "/");
  await page.getByRole("link", { name: "Chats" }).first().click();
  await page.getByText("Laura", { exact: true }).first().click();
  await page.locator(".shared-document img").click();

  await expect(page).toHaveURL(
    `/images/${BEACH_ID}?chat=${LAURA}&owner=${MARY}`,
  );
  await expect(page.locator("main img")).toHaveCount(1);
  await expect(page.locator(".shared-document")).toBeHidden();

  await page.getByLabel("back-button").click();
  await expect(page).toHaveURL(`/chats/${LAURA}`);
  await expect(page.locator(".shared-document img")).toBeVisible();
});

test("open an own shared image detail view directly after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await routeBeachImage(page);
  await routeChatSharingBeachImage(page);

  // Nothing is registered in memory - the document is resolved from the URL
  // alone (the owner needs no chat key, the image is in their own root folder)
  await login(page, `/images/${BEACH_ID}?chat=${LAURA}&owner=${MARY}`);

  await expect(page.getByAltText(BEACH_NAME)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("No image found")).toBeHidden();

  await page.getByLabel("back-button").click();
  await expect(page).toHaveURL(`/chats/${LAURA}`);
});

test("open an image shared by a contact directly after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await routeChatWithBeachImageSharedByLaura(page);

  // The chat key has to be resolved from the "chats" document first
  await login(page, `/images/${BEACH_ID}?chat=${LAURA}&owner=${LAURA}`);

  await expect(page.getByAltText(BEACH_NAME)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("No image found")).toBeHidden();
});

test("an image shared by a contact without a chat cannot be resolved", async ({
  page,
}) => {
  await routeChatWithBeachImageSharedByLaura(page);

  await login(page, `/images/${BEACH_ID}?chat=unknown-contact&owner=${LAURA}`);

  await expect(page.getByText("No image found")).toBeVisible();
});

test("an image in a sub-folder cannot be resolved after a reload", async ({
  page,
}) => {
  await routeBeachImage(page);

  // The parent chain of the sub-folder is gone after the reload, so its key
  // cannot be derived - no endless spinner, but the placeholder
  await login(page, `/images/${BEACH_ID}?folder=${FOLDER_ID}`);

  await expect(page.getByText("No image found")).toBeVisible();
});
