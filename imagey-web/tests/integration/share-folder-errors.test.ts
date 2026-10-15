import { test, expect } from "./fixtures";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  clearLocalStorage,
  generateAesGcmKeyJwk,
} from "./setup";
import { json, parseMultipart } from "./shared-folder-fixtures";
import type { folderShareService } from "../../src/folder/FolderShareService";

declare global {
  interface Window {
    folderShareService: typeof folderShareService;
  }
}

const MARY = "d20cf443-4f96-418f-a957-c8cbef8677c3";
const LAURA = "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

// Everything below drives folderShareService directly (main.tsx exposes it in DEV) against
// page.route fixtures: the branches of a share that are hard to reach through the UI and that a
// real provider would never produce on purpose.

test("a share with contributions gives the contact the right on the folder - once, for everything below", async ({
  page,
}) => {
  await page.goto("/");
  const rights: string[] = [];
  const chatKey = await generateAesGcmKeyJwk();
  const chatsKey = await generateAesGcmKeyJwk();
  await page.route(`**/users/${MARY}/documents/chat-laura`, (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route(`**/users/${MARY}/documents/chat-laura/messages`, (route) =>
    route.fulfill({
      status: 201,
      headers: { Location: "/messages/1" },
      json: { id: "1-id", timestamp: "2026-10-15T10:00:00.000Z" },
    }),
  );
  await page.route(`**/users/${MARY}/documents/shared-folder/keys`, (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route(`**/users/${MARY}/documents/**/contributions/*`, (route) => {
    rights.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname.split(MARY)[1]}`,
    );
    return route.fulfill({ status: 204 });
  });
  await page.route(`**/users/${MARY}/documents/shared-folder`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 204, headers: { ETag: '"v2"' } })
      : route.fallback(),
  );

  const result = await page.evaluate(
    async ({ chatKey, chatsKey }) =>
      window.folderShareService.shareFolder(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        {
          documentId: "chats",
          name: "Chats",
          key: chatsKey,
          revision: '"c1"',
          contacts: [],
          groups: [],
          sharedFolders: [],
        },
        {
          documentId: "shared-folder",
          name: "Shared",
          owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          revision: '"v1"',
          key: chatKey,
          type: "folder",
          documents: [
            {
              documentId: "child",
              name: "Child",
              type: "folder",
              sharedKey: { sharedKey: "unused" },
            },
          ],
        },
        {
          userId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
          chatId: "chat-laura",
          owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          name: "Laura",
          profileRevision: "0",
          pending: { chatKey, publicProfiles: {} },
        },
        true,
      ),
    { chatKey, chatsKey },
  );

  expect(result.sharedWith).toEqual([
    { contactUserId: LAURA, contributions: true },
  ]);
  // One request, for the shared folder and the contact: no sub-folder is looked at or opened.
  expect(rights).toEqual([
    `PUT /documents/shared-folder/contributions/${LAURA}`,
  ]);
});

test("recording a share retries on a concurrent change and is not fatal when it keeps failing", async ({
  page,
}) => {
  await page.goto("/");
  const chatKey = await generateAesGcmKeyJwk();
  const chatsKey = await generateAesGcmKeyJwk();
  const fixture = await page.evaluate(async () => {
    const crypto = window.cryptoService;
    const folderKey = await crypto.generateSymmetricKey();
    const content = (
      await crypto.encryptDocument(folderKey, [
        new TextEncoder().encode(
          JSON.stringify({ type: "folder", name: "Shared", documents: [] }),
        ).buffer as ArrayBuffer,
      ])
    )[0];
    const file = (
      await crypto.encryptDocument(folderKey, [
        new TextEncoder().encode(
          JSON.stringify({
            type: "file",
            name: "x.txt",
            mimeType: "text/plain",
          }),
        ).buffer as ArrayBuffer,
      ])
    )[0];
    return {
      folderKey,
      base64: btoa(String.fromCharCode(...new Uint8Array(content))),
      fileBase64: btoa(String.fromCharCode(...new Uint8Array(file))),
    };
  });
  let puts = 0;
  let keysStatus = 200;
  let mode: "retry" | "always" | "other" | "not-a-folder" = "retry";
  await page.route(`**/users/${MARY}/documents/chat-laura`, (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route(`**/users/${MARY}/documents/chat-laura/messages`, (route) =>
    route.fulfill({
      status: 201,
      headers: { Location: "/messages/1" },
      json: { id: "1-id", timestamp: "2026-10-15T10:00:00.000Z" },
    }),
  );
  await page.route(`**/users/${MARY}/documents/folder/keys`, (route) =>
    route.fulfill({ status: keysStatus }),
  );
  // Shared without contributions: a right given before is taken away.
  const taken: string[] = [];
  await page.route(
    `**/users/${MARY}/documents/folder/contributions/*`,
    (route) => {
      taken.push(route.request().method());
      return route.fulfill({ status: 204 });
    },
  );
  await page.route(`**/users/${MARY}/documents/folder`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        headers: { ETag: '"v-reloaded"' },
        body: Buffer.from(
          mode === "not-a-folder" ? fixture.fileBase64 : fixture.base64,
          "base64",
        ),
      });
    }
    puts++;
    if (mode === "retry" && puts === 1) {
      return route.fulfill({ status: 412 });
    }
    if (mode === "always" || mode === "not-a-folder") {
      return route.fulfill({ status: 412 });
    }
    if (mode === "other") {
      return route.fulfill({ status: 500 });
    }
    return route.fulfill({ status: 204, headers: { ETag: '"v-after"' } });
  });

  const share = () =>
    page.evaluate(
      async ({ fixture, chatKey, chatsKey }) =>
        window.folderShareService.shareFolder(
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
          {
            documentId: "chats",
            name: "Chats",
            key: chatsKey,
            revision: '"c1"',
            contacts: [],
            groups: [],
            sharedFolders: [],
          },
          {
            documentId: "folder",
            name: "Shared",
            owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            revision: '"v1"',
            key: fixture.folderKey,
            type: "folder",
            documents: [],
          },
          {
            userId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
            chatId: "chat-laura",
            owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            name: "Laura",
            profileRevision: "0",
            pending: { chatKey, publicProfiles: {} },
          },
          false,
        ),
      { fixture, chatKey, chatsKey },
    );

  const retried = await share();
  expect(retried.revision).toBe('"v-after"');
  expect(taken).toEqual(["DELETE"]);
  expect(puts).toBe(2);

  mode = "always";
  puts = 0;
  const gaveUp = await share();
  expect(gaveUp.revision).toBeNull();
  expect(puts).toBe(2);

  mode = "other";
  puts = 0;
  const failed = await share();
  expect(failed.revision).toBeNull();
  expect(puts).toBe(1);

  // Shared with the same contact again: the key slot is taken (409), which is as good as filed.
  keysStatus = 409;
  mode = "retry";
  puts = 0;
  const again = await share();
  expect(again.revision).toBe('"v-after"');
  keysStatus = 200;

  // The folder was replaced by something else meanwhile: nothing is recorded over it.
  mode = "not-a-folder";
  puts = 0;
  const replaced = await share();
  expect(replaced.revision).toBeNull();
  expect(puts).toBe(1);
});

test("sharing with a contact on another server without an address is refused", async ({
  page,
}) => {
  await page.goto("/");
  const chatsKey = await generateAesGcmKeyJwk();

  const message = await page.evaluate(async (chatsKey) => {
    try {
      await window.folderShareService.shareFolder(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        {
          documentId: "chats",
          name: "Chats",
          key: chatsKey,
          revision: '"c1"',
          contacts: [],
          groups: [],
          sharedFolders: [],
        },
        {
          documentId: "folder",
          name: "Shared",
          owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          revision: '"v1"',
          key: {} as JsonWebKey,
          type: "folder",
          documents: [],
        },
        {
          userId: "someone-there",
          chatId: "chat-there",
          owner: "someone-there",
          name: "Someone",
          profileRevision: "0",
          chatOrigin: "https://other.test",
        },
        false,
        false,
      );
      return "shared";
    } catch (e) {
      return (e as Error).name;
    }
  }, chatsKey);

  expect(message).toBe("NoAddressToShareWithError");
});

test("taking over a shared document that is not a folder fails", async ({
  page,
}) => {
  await page.goto("/");
  const chatKey = await generateAesGcmKeyJwk();
  const chatsKey = await generateAesGcmKeyJwk();
  const fixture = await page.evaluate(async (chatKey) => {
    const crypto = window.cryptoService;
    const documentKey = await crypto.generateSymmetricKey();
    const content = (
      await crypto.encryptDocument(documentKey, [
        new TextEncoder().encode(
          JSON.stringify({
            type: "file",
            name: "x.txt",
            mimeType: "text/plain",
          }),
        ).buffer as ArrayBuffer,
      ])
    )[0];
    return {
      base64: btoa(String.fromCharCode(...new Uint8Array(content))),
      wrapped: await crypto.encryptKey(documentKey, chatKey),
    };
  }, chatKey);
  await page.route(`**/users/alice/documents/not-a-folder`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: Buffer.from(fixture.base64, "base64"),
    }),
  );
  await page.route(`**/users/alice/documents/not-a-folder/keys/*`, (route) =>
    route.fulfill({ status: 200, json: { sharedKey: fixture.wrapped } }),
  );

  const message = await page.evaluate(
    async ({ chatKey, chatsKey }) => {
      try {
        await window.folderShareService.acceptSharedFolder(
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
          {
            documentId: "chats",
            name: "Chats",
            key: chatsKey,
            revision: '"c1"',
            contacts: [],
            groups: [],
            sharedFolders: [],
          },
          chatKey,
          { documentId: "not-a-folder", owner: "alice", contributions: false },
          {
            userId: "alice",
            chatId: "chat-mary",
            owner: "alice",
            name: "Alice",
            profileRevision: "0",
          },
        );
        return "taken over";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { chatKey, chatsKey },
  );

  expect(message).toContain("Expected a folder document, got file");
});

test("a retried upload keeps the shares the owner recorded meanwhile", async ({
  page,
}) => {
  await page.goto("/");
  const folderKey = await generateAesGcmKeyJwk();
  const recorded = [
    { contactUserId: "b", contributions: true },
    { contactUserId: "c", contributions: false },
  ];
  const current = await aesGcmEncrypt(
    folderKey,
    json({
      type: "folder",
      name: "Shared",
      documents: [],
      sharedWith: recorded,
    }),
  );
  let posts = 0;
  let written: Buffer | undefined;
  await page.route(new RegExp(`/users/${MARY}/documents$`), (route) => {
    const request = route.request();
    posts++;
    if (posts === 1) {
      return route.fulfill({ status: 412 });
    }
    written = parseMultipart(
      request.postDataBuffer()!,
      request.headers()["content-type"],
    ).get("folder");
    return route.fulfill({
      status: 201,
      headers: { Location: `/users/${MARY}/documents/new`, ETag: '"after"' },
    });
  });
  await page.route(`**/users/${MARY}/documents/folder`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      headers: { ETag: '"reloaded"' },
      body: current,
    }),
  );

  await page.evaluate(
    async ({ folderKey, mary }) =>
      window.documentService.storeDocument(
        mary,
        new File(["hello"], "notes.txt", { type: "text/plain" }),
        {
          documentId: "folder",
          name: "Shared",
          owner: mary,
          revision: '"stale"',
          key: folderKey,
          type: "folder",
          documents: [],
          // What the folder was loaded with: only the first share.
          sharedWith: [{ contactUserId: "b", contributions: true }],
        },
        folderKey,
      ),
    { folderKey, mary: MARY },
  );

  expect(posts).toBe(2);
  const content = JSON.parse(
    (await aesGcmDecrypt(folderKey, written!)).toString("utf8"),
  );
  expect(content.sharedWith).toEqual(recorded);
});

test("nothing is opened for contributions when the folder could not be shared", async ({
  page,
}) => {
  await page.goto("/");
  const chatKey = await generateAesGcmKeyJwk();
  const chatsKey = await generateAesGcmKeyJwk();
  const opened: string[] = [];
  await page.route(`**/users/${MARY}/documents/chat-laura`, (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route(`**/users/${MARY}/documents/chat-laura/messages`, (route) =>
    route.fulfill({
      status: 201,
      headers: { Location: "/messages/1" },
      json: { id: "1-id", timestamp: "2026-10-15T10:00:00.000Z" },
    }),
  );
  // The grant cannot be filed: the right, which belongs to a grant, must not be given either.
  await page.route(`**/users/${MARY}/documents/folder/keys`, (route) =>
    route.fulfill({ status: 500 }),
  );
  await page.route(`**/users/${MARY}/documents/*/contributions/*`, (route) => {
    opened.push(route.request().url());
    return route.fulfill({ status: 204 });
  });

  const result = await page.evaluate(
    async ({ chatKey, chatsKey }) => {
      try {
        await window.folderShareService.shareFolder(
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
          {
            documentId: "chats",
            name: "Chats",
            key: chatsKey,
            revision: '"c1"',
            contacts: [],
            groups: [],
            sharedFolders: [],
          },
          {
            documentId: "folder",
            name: "Shared",
            owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            revision: '"v1"',
            key: chatKey,
            type: "folder",
            documents: [],
          },
          {
            userId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
            chatId: "chat-laura",
            owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            name: "Laura",
            profileRevision: "0",
            pending: { chatKey, publicProfiles: {} },
          },
          true,
          true,
        );
        return "shared";
      } catch {
        return "failed";
      }
    },
    { chatKey, chatsKey },
  );

  expect(result).toBe("failed");
  expect(opened).toEqual([]);
});
