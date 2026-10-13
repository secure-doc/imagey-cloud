import * as fs from "fs";
import { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import type {} from "../../src/main";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  clearLocalStorage,
  encryptedDocument,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  inputMarysPassword,
  loginAsMaryAt,
  messageId,
  messageTimestamp,
  MARY_ID,
  routeGeneratedDocument,
  routeMarysAuth,
  setupMarysDevice,
  TestData,
} from "./setup";

// Chat across the server boundary (ADR 0013 A11, F8). Mary has an account on the own server; her
// contact alice has hers at A, where the chat lives (alice invited mary). Mary reads and writes
// the chat as a guest of A. A is stubbed with page.route: a foreign origin and its error paths do
// not belong into a Pact contract (AGENTS.md); the calls to the own server that are not new are
// contracts elsewhere (chat.test.ts, federation-accept.test.ts).

const A = "https://a.test";
const ALICE_A = "alice-on-a"; // alice's id at A
const MARY_A = "mary-on-a"; // mary's id at A
const ALICE_B = "alice-on-b"; // alice's id on the own server
const CHAT = "chat-alice-mary";
const ALICE_PP = "alices-public-profile";
const MARY_ADDRESS = "mary@imagey.cloud";
const CHATS_ID = TestData.mary.settings!.chats;
const ROOT_ID = TestData.mary.settings!.documents;
const ROOT_KEY = TestData.mary.documents[0].key!;
const BEACH_ID = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3";
const BEACH_KEY = TestData.mary.documents[2].key!;
const BEACH_NAME = "beach-1836467_1920.jpg";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Location, ETag, Last-Modified",
};

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

interface Contact {
  userId: string;
  chatId: string;
  owner: string;
  name: string;
  profileRevision: string;
  email?: string;
  chatOrigin?: string;
  self?: { userId: string; address: string };
  localUserId?: string;
  profileHome?: { origin: string; userId: string };
  pending?: { chatKey: JsonWebKey; publicProfiles: Record<string, string> };
}

const alice = (more: Partial<Contact> = {}): Contact => ({
  userId: ALICE_A,
  chatId: CHAT,
  owner: ALICE_A,
  name: "Alice",
  profileRevision: "",
  email: "alice@a.test",
  chatOrigin: A,
  self: { userId: MARY_A, address: MARY_ADDRESS },
  localUserId: ALICE_B,
  ...more,
});

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

async function seen(route: Route): Promise<Seen> {
  const request = route.request();
  return {
    method: request.method(),
    url: request.url(),
    headers: await request.allHeaders(),
    body: request.postData(),
  };
}

const text = (key: JsonWebKey, content: string) =>
  aesGcmEncrypt(key, new TextEncoder().encode(content)).then((b) =>
    b.toString("base64"),
  );

interface Story {
  // The entry of alice in mary's chat list.
  contact?: Contact;
  // The messages of the chat at A, oldest first (plain text or a JSON payload).
  messages?: { sender: string; content: string }[];
  // The answer of A for the chat document: 200, or 403 as long as alice has not created it.
  chatDocument?: 200 | 403;
  // The public profile of alice (name) at A, if she shared one.
  aliceName?: string;
  // Whether the HEAD for the last activity fails.
  lastActivityStatus?: number;
  // Whether alice shared the beach image from A.
  beachFromAlice?: boolean;
}

// Everything the app asks the own server and A for. Returns what was seen.
async function routeStory(page: Page, story: Story = {}) {
  const {
    contact = alice(),
    messages = [],
    chatDocument = 200,
    aliceName,
    lastActivityStatus = 200,
    beachFromAlice = false,
  } = story;
  const own = {
    shares: [] as Seen[],
    principals: [] as Seen[],
    chatsPuts: [] as Buffer[],
    messages: [] as Seen[],
    assertions: [] as Seen[],
  };
  const remote = {
    sessions: [] as Seen[],
    chat: [] as Seen[],
    messages: [] as Seen[],
    posts: [] as Seen[],
    heads: [] as Seen[],
    profile: [] as Seen[],
    beach: [] as Seen[],
  };
  const settingsKey = TestData.mary.settingsKey!;
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = contact.pending?.chatKey ?? (await generateAesGcmKeyJwk());
  const ppKey = await generateAesGcmKeyJwk();
  let chatsContent = await encryptedDocument(chatsKey, {
    type: "chatList",
    name: "Chats",
    contacts: [contact],
  });
  let chatsRevision = 1;

  await routeMarysAuth(page);
  await page.route(
    `**/users/${MARY_ID}/documents/${CHATS_ID}`,
    async (route) => {
      if (route.request().method() === "PUT") {
        chatsContent = (await seen(route)) && route.request().postDataBuffer()!;
        own.chatsPuts.push(chatsContent);
        chatsRevision++;
        await route.fulfill({
          status: 204,
          headers: { ETag: `"chats-${chatsRevision}"` },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ETag: `"chats-${chatsRevision}"` },
        contentType: "application/octet-stream",
        body: chatsContent,
      });
    },
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${CHATS_ID}/keys/${MARY_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(chatsKey, settingsKey) },
      }),
  );
  await page.route(`**/users/${MARY_ID}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/federation-assertions$`),
    async (route) => {
      own.assertions.push(await seen(route));
      await route.fulfill({ status: 200, json: { assertion: "a.b.c" } });
    },
  );
  await page.route(`**/users/${MARY_ID}/foreign-principals`, async (route) => {
    own.principals.push(await seen(route));
    await route.fulfill({ status: 200, json: { userId: ALICE_B } });
  });
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/[^/]+/keys$`),
    async (route) => {
      own.shares.push(await seen(route));
      await route.fulfill({ status: 200 });
    },
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/[^/]+/messages`),
    async (route) => {
      own.messages.push(await seen(route));
      await route.fulfill({ status: 200, json: [] });
    },
  );

  const encryptedMessages = await Promise.all(
    messages.map(async (m, i) => ({
      id: messageId(i + 1),
      timestamp: messageTimestamp(i + 1),
      sender: m.sender,
      content: await text(chatKey, m.content),
    })),
  );
  const chatContent = await encryptedDocument(chatKey, {
    type: "chat",
    name: "Chat",
    publicProfiles: { [MARY_A]: "marys-public-profile", [ALICE_A]: ALICE_PP },
  });
  const profileContent = await encryptedDocument(ppKey, {
    type: "publicProfile",
    name: aliceName ?? "Alice",
  });
  const beachFile = (file: string) =>
    `tests/images/encrypted/${BEACH_ID}/files/${file}`;

  await page.route(`${A}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE",
          "Access-Control-Allow-Headers":
            "authorization, access-path, content-type, prefer, notify, if-match",
        },
      });
      return;
    }
    const respond = (response: Parameters<Route["fulfill"]>[0]) =>
      route.fulfill({ ...response, headers: { ...CORS, ...response.headers } });
    if (path === "/users/federation/sessions") {
      remote.sessions.push(await seen(route));
      return respond({
        status: 200,
        json: { token: "guest-token", userId: MARY_A, expiresIn: 900 },
      });
    }
    const documents = `/users/${ALICE_A}/documents`;
    if (path === `${documents}/${CHAT}`) {
      remote.chat.push(await seen(route));
      return respond(
        chatDocument === 200
          ? {
              status: 200,
              contentType: "application/octet-stream",
              body: chatContent,
            }
          : { status: 403 },
      );
    }
    if (path === `${documents}/${CHAT}/keys/${MARY_A}`) {
      return respond(
        chatDocument === 200
          ? {
              status: 200,
              json: { sharedKey: await encryptKeyEnvelope(chatKey, chatsKey) },
            }
          : { status: 403 },
      );
    }
    if (path === `${documents}/${CHAT}/messages`) {
      const s = await seen(route);
      if (request.method() === "HEAD") {
        remote.heads.push(s);
        return respond(
          lastActivityStatus === 200
            ? {
                status: 200,
                headers: {
                  "Last-Modified": new Date(messageTimestamp(1)).toUTCString(),
                },
              }
            : { status: lastActivityStatus },
        );
      }
      if (request.method() === "POST") {
        remote.posts.push(s);
        return respond({
          status: 201,
          headers: { Location: `${path}/${messageId(99)}` },
          json: { timestamp: messageTimestamp(99) },
        });
      }
      remote.messages.push(s);
      return respond({
        status: 200,
        json: url.searchParams.has("sinceId") ? [] : encryptedMessages,
      });
    }
    if (path === `${documents}/${ALICE_PP}`) {
      remote.profile.push(await seen(route));
      return respond({
        status: 200,
        headers: { ETag: '"pp-1"' },
        contentType: "application/octet-stream",
        body: profileContent,
      });
    }
    if (path === `${documents}/${ALICE_PP}/keys/${MARY_A}`) {
      return respond({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(ppKey, chatKey) },
      });
    }
    if (beachFromAlice && path === `${documents}/${BEACH_ID}`) {
      remote.beach.push(await seen(route));
      return respond({
        status: 200,
        contentType: "application/octet-stream",
        body: fs.readFileSync(
          `tests/images/encrypted/${BEACH_ID}/document.enc`,
        ),
      });
    }
    if (beachFromAlice && path === `${documents}/${BEACH_ID}/keys/${MARY_A}`) {
      return respond({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(BEACH_KEY, chatKey) },
      });
    }
    if (beachFromAlice && path.startsWith(`${documents}/${BEACH_ID}/files/`)) {
      remote.beach.push(await seen(route));
      return respond({
        status: 200,
        contentType: "application/octet-stream",
        body: fs.readFileSync(beachFile(path.split("/").pop()!)),
      });
    }
    return respond({ status: 404 });
  });
  return { own, remote, chatKey, chatsKey, getChats: () => chatsContent };
}

const bubble = (page: Page, content: string) =>
  page.locator("div.elevate", { hasText: content });

test("the messages of a chat on another server are read and written as a guest", async ({
  page,
}) => {
  const { own, remote, chatKey } = await routeStory(page, {
    messages: [
      { sender: ALICE_A, content: "Hello Mary" },
      { sender: MARY_A, content: "Hi Alice" },
    ],
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);

  // Alice's message is on the left, mary's own (sender: her id AT A) on the right.
  await expect(bubble(page, "Hello Mary")).toHaveCSS(
    "align-self",
    "flex-start",
  );
  await expect(bubble(page, "Hi Alice")).toHaveCSS("align-self", "flex-end");
  expect(remote.sessions.length).toBeGreaterThan(0);
  expect(remote.messages[0].headers["authorization"]).toBe(
    "Bearer guest-token",
  );
  expect(remote.chat[0].headers["authorization"]).toBe("Bearer guest-token");

  await page.getByLabel("Type a message").fill("How are you?");
  await page.getByLabel("Type a message").press("Enter");

  await expect(bubble(page, "How are you?")).toHaveCSS(
    "align-self",
    "flex-end",
  );
  expect(remote.posts).toHaveLength(1);
  expect(remote.posts[0].url).toBe(
    `${A}/users/${ALICE_A}/documents/${CHAT}/messages`,
  );
  // alice is notified with her id at A, which is where the chat is
  expect(remote.posts[0].headers["notify"]).toBe(ALICE_A);
  expect(
    (
      await aesGcmDecrypt(chatKey, Buffer.from(remote.posts[0].body!, "base64"))
    ).toString(),
  ).toBe("How are you?");
  // nothing of the chat touches the own server
  expect(own.messages).toEqual([]);
});

test("before alice created the chat the pending key is used", async ({
  page,
}) => {
  const pendingKey = await generateAesGcmKeyJwk();
  const { remote } = await routeStory(page, {
    contact: alice({
      pending: {
        chatKey: pendingKey,
        publicProfiles: { [MARY_A]: "marys-public-profile" },
      },
    }),
    chatDocument: 403,
    messages: [{ sender: MARY_A, content: "Anybody there?" }],
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);

  await expect(bubble(page, "Anybody there?")).toHaveCSS(
    "align-self",
    "flex-end",
  );
  expect(remote.chat.length).toBeGreaterThan(0);
});

test("once the chat exists the pending key is dropped", async ({ page }) => {
  const pendingKey = await generateAesGcmKeyJwk();
  const { own, chatsKey } = await routeStory(page, {
    contact: alice({
      pending: { chatKey: pendingKey, publicProfiles: {} },
    }),
    messages: [{ sender: ALICE_A, content: "Welcome" }],
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);

  await expect(bubble(page, "Welcome")).toBeVisible();
  await expect.poll(() => own.chatsPuts.length).toBeGreaterThan(0);
  const stored = JSON.parse(
    (await aesGcmDecrypt(chatsKey, own.chatsPuts.at(-1)!)).toString(),
  );
  expect(stored.contacts[0].pending).toBeUndefined();
  expect(stored.contacts[0].chatOrigin).toBe(A);
});

test("the profile of alice is read at A and refreshes the snapshot", async ({
  page,
}) => {
  const { own, remote, chatsKey } = await routeStory(page, {
    aliceName: "Alice Wonder",
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);

  await expect(page.getByText("Alice Wonder").first()).toBeVisible();
  expect(remote.profile[0].headers["authorization"]).toBe("Bearer guest-token");
  await expect.poll(() => own.chatsPuts.length).toBeGreaterThan(0);
  const stored = JSON.parse(
    (await aesGcmDecrypt(chatsKey, own.chatsPuts.at(-1)!)).toString(),
  );
  expect(stored.contacts[0].name).toBe("Alice Wonder");
});

test("a contact whose profile lives on another server is read there as a guest", async ({
  page,
}) => {
  // mary's chat with bob is local; bob's profile is a document of his at B.
  const B = "https://b.test";
  const BOB = "bob-on-a";
  const BOB_B = "bob-on-b";
  const MARY_B = "mary-on-b";
  const BOBS_PROFILE = "bobs-public-profile";
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();
  const ppKey = await generateAesGcmKeyJwk();
  const profiles: Seen[] = [];
  await routeMarysAuth(page);
  await routeGeneratedDocument(
    page,
    CHATS_ID,
    await encryptedDocument(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts: [
        {
          userId: BOB,
          chatId: "chat-bob",
          owner: MARY_ID,
          name: "Bob",
          profileRevision: "",
          profileHome: { origin: B, userId: BOB_B },
        },
      ],
    }),
    MARY_ID,
    await encryptKeyEnvelope(chatsKey, TestData.mary.settingsKey!),
  );
  await routeGeneratedDocument(
    page,
    "chat-bob",
    await encryptedDocument(chatKey, {
      type: "chat",
      name: "Chat",
      publicProfiles: { [BOB]: BOBS_PROFILE },
    }),
    CHATS_ID,
    await encryptKeyEnvelope(chatKey, chatsKey),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/chat-bob/messages`),
    (route) => route.fulfill({ status: 200, json: [] }),
  );
  await page.route(`**/users/${MARY_ID}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/federation-assertions$`),
    (route) => route.fulfill({ status: 200, json: { assertion: "a.b.c" } }),
  );
  await page.route(`${B}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (response: Parameters<Route["fulfill"]>[0]) =>
      route.fulfill({ ...response, headers: { ...CORS, ...response.headers } });
    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE",
          "Access-Control-Allow-Headers":
            "authorization, access-path, content-type, prefer, notify, if-match",
        },
      });
    }
    if (path === "/users/federation/sessions") {
      return respond({
        status: 200,
        json: { token: "guest-b", userId: MARY_B, expiresIn: 900 },
      });
    }
    if (path === `/users/${BOB_B}/documents/${BOBS_PROFILE}`) {
      profiles.push(await seen(route));
      return respond({
        status: 200,
        contentType: "application/octet-stream",
        body: await encryptedDocument(ppKey, {
          type: "publicProfile",
          name: "Bob Builder",
        }),
      });
    }
    // The key entry hangs under mary's id AT B.
    if (path === `/users/${BOB_B}/documents/${BOBS_PROFILE}/keys/${MARY_B}`) {
      return respond({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(ppKey, chatKey) },
      });
    }
    return respond({ status: 404 });
  });

  await setupMarysDevice(page);
  await page.goto(`/chats/${BOB}`);
  await inputMarysPassword(page);

  await expect(page.getByText("Bob Builder").first()).toBeVisible();
  expect(profiles[0].headers["authorization"]).toBe("Bearer guest-b");
});

test("an image alice shared from A is shown, opened and reachable after a reload", async ({
  page,
}) => {
  await routeStory(page, {
    beachFromAlice: true,
    messages: [
      {
        sender: ALICE_A,
        content: JSON.stringify({
          type: "shared-document",
          documentId: BEACH_ID,
          owner: ALICE_A,
        }),
      },
    ],
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);
  await expect(page.locator(".shared-document img")).toBeVisible();
  await page.locator(".shared-document img").click();

  const detail = `/images/${BEACH_ID}?chat=${ALICE_A}&owner=${ALICE_A}&origin=${encodeURIComponent(A)}`;
  await expect(page).toHaveURL(detail);
  await expect(page.locator("main img")).toHaveCount(1);

  // A deep link: nothing is registered, the document is resolved again from the URL.
  await page.goto(detail);
  await inputMarysPassword(page);
  await expect(page.locator("main img")).toHaveCount(1);
});

// The origin of a shared document comes from the other party and is only followed to a server the
// contact is known to live on - else a guest login there would hand them an address of ours.
const EVIL = "https://evil.test";

async function watchEvil(page: Page) {
  const seenByEvil: string[] = [];
  await page.route(`${EVIL}/**`, (route) => {
    seenByEvil.push(route.request().url());
    return route.fulfill({ status: 404, headers: CORS });
  });
  return seenByEvil;
}

test("a shared document naming a server the contact does not live on is not loaded", async ({
  page,
}) => {
  const seenByEvil = await watchEvil(page);
  const { own } = await routeStory(page, {
    messages: [
      {
        sender: ALICE_A,
        content: JSON.stringify({
          type: "shared-document",
          documentId: BEACH_ID,
          owner: ALICE_A,
          origin: EVIL,
        }),
      },
    ],
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);

  await expect(page.getByText("Error loading shared document")).toBeVisible();
  expect(seenByEvil).toEqual([]);
  expect(own.assertions.filter((a) => a.body!.includes("evil.test"))).toEqual(
    [],
  );
});

test("a detail link naming a server the contact does not live on finds no image", async ({
  page,
}) => {
  const seenByEvil = await watchEvil(page);
  const { own } = await routeStory(page, { beachFromAlice: true });

  await loginAsMaryAt(
    page,
    `/images/${BEACH_ID}?chat=${ALICE_A}&owner=${ALICE_A}&origin=${encodeURIComponent(EVIL)}`,
  );

  await expect(page.getByText("No image found")).toBeVisible();
  expect(seenByEvil).toEqual([]);
  expect(own.assertions.filter((a) => a.body!.includes("evil.test"))).toEqual(
    [],
  );
});

test("a detail page opened by deep link renews the guest session with the address of the chat", async ({
  page,
}) => {
  const { own } = await routeStory(page, {
    beachFromAlice: true,
    contact: alice({ self: { userId: MARY_A, address: "mary@other.test" } }),
  });

  await loginAsMaryAt(
    page,
    `/images/${BEACH_ID}?chat=${ALICE_A}&owner=${ALICE_A}&origin=${encodeURIComponent(A)}`,
  );

  await expect(page.locator("main img")).toHaveCount(1);
  expect(own.assertions.map((a) => JSON.parse(a.body!))).toEqual([
    { aud: "a.test", email: "mary@other.test" },
  ]);
});

test("an origin in the URL that is no origin finds no image", async ({
  page,
}) => {
  await routeStory(page, { beachFromAlice: true });

  await loginAsMaryAt(
    page,
    `/images/${BEACH_ID}?chat=${ALICE_A}&owner=${ALICE_A}&origin=nonsense`,
  );

  await expect(page.getByText("No image found")).toBeVisible();
});

// The root folder with the beach image, as mary's picker loads it, and the image itself.
async function routeOwnBeachImage(page: Page) {
  await routeGeneratedDocument(
    page,
    ROOT_ID,
    await encryptedDocument(ROOT_KEY, {
      type: "folder",
      name: "Documents",
      documents: [
        {
          documentId: BEACH_ID,
          name: BEACH_NAME,
          type: "image",
          mimeType: "image/jpeg",
          mediumImageId: "7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0",
          sharedKey: {
            sharedKey: await encryptKeyEnvelope(BEACH_KEY, ROOT_KEY),
          },
        },
      ],
    }),
    MARY_ID,
    await encryptKeyEnvelope(ROOT_KEY, TestData.mary.settingsKey!),
  );
  await page.route(`**/users/${MARY_ID}/documents/${BEACH_ID}`, (route) =>
    route.fulfill({
      status: 200,
      path: `tests/images/encrypted/${BEACH_ID}/document.enc`,
    }),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/${BEACH_ID}/files/[^/]+$`),
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${BEACH_ID}/files/${route.request().url().split("/").pop()}`,
      }),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${BEACH_ID}/keys/${ROOT_ID}`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${BEACH_ID}/keys/${ROOT_ID}.json`,
      }),
  );
}

test("an image mary shares stays on the own server and says so", async ({
  page,
}) => {
  const { own, remote, chatKey } = await routeStory(page);
  await routeOwnBeachImage(page);

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);
  await page.getByRole("button", { name: "attach_file" }).click();
  await page.getByRole("dialog").getByAltText(BEACH_NAME).click();

  // The key entry is for alice's id ON THE OWN SERVER, wrapped with the chat key ...
  await expect.poll(() => own.shares.length).toBe(1);
  expect(own.shares[0].url).toContain(
    `/users/${MARY_ID}/documents/${BEACH_ID}/keys`,
  );
  const key = JSON.parse(own.shares[0].body!);
  expect(key.issuer).toBe(ALICE_B);
  expect(key.kid).toBe(ALICE_B);
  expect(
    JSON.parse(
      (
        await aesGcmDecrypt(chatKey, Buffer.from(key.sharedKey, "base64"))
      ).toString(),
    ),
  ).toEqual(BEACH_KEY);
  // ... and the message, posted at A, names the own server as the place of the image.
  await expect.poll(() => remote.posts.length).toBe(1);
  const message = JSON.parse(
    (
      await aesGcmDecrypt(chatKey, Buffer.from(remote.posts[0].body!, "base64"))
    ).toString(),
  );
  expect(message).toEqual({
    type: "shared-document",
    documentId: BEACH_ID,
    owner: MARY_ID,
    origin: new URL(page.url()).origin,
  });
  // her own image is shown from her own tree
  await expect(page.locator(".shared-document img")).toBeVisible();
});

test("an entry from before F8 gets the id of alice on the own server when sharing", async ({
  page,
}) => {
  const { own, getChats, chatsKey } = await routeStory(page, {
    contact: alice({ localUserId: undefined }),
  });
  await routeOwnBeachImage(page);

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);
  await page.getByRole("button", { name: "attach_file" }).click();
  await page.getByRole("dialog").getByAltText(BEACH_NAME).click();

  await expect.poll(() => own.shares.length).toBe(1);
  expect(own.principals).toHaveLength(1);
  expect(JSON.parse(own.principals[0].body!)).toMatchObject({
    domain: "a.test",
    address: "alice@a.test",
  });
  expect(JSON.parse(own.shares[0].body!).kid).toBe(ALICE_B);
  // remembered for the next time
  const stored = JSON.parse(
    (await aesGcmDecrypt(chatsKey, getChats())).toString(),
  );
  expect(stored.contacts[0].localUserId).toBe(ALICE_B);

  // The next share needs no new registration: the canonical chat list state knows the id now.
  const putsBefore = own.chatsPuts.length;
  await page.getByRole("button", { name: "attach_file" }).click();
  await page.getByRole("dialog").getByAltText(BEACH_NAME).click();
  await expect.poll(() => own.shares.length).toBe(2);
  expect(own.principals).toHaveLength(1);
  expect(own.chatsPuts).toHaveLength(putsBefore);
});

test("nothing can be shared with a contact on another server without an address", async ({
  page,
}) => {
  await routeStory(page, {
    contact: alice({ localUserId: undefined, email: undefined }),
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);

  await expect(
    page.getByRole("button", { name: "attach_file" }),
  ).toBeDisabled();
});

test("the last activity of a chat on another server is shown, and a failure only blanks its row", async ({
  page,
}) => {
  const { remote } = await routeStory(page, {
    lastActivityStatus: 500,
  });

  await loginAsMaryAt(page, "/chats");

  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect.poll(() => remote.heads.length).toBeGreaterThan(0);
  expect(remote.heads[0].headers["authorization"]).toBe("Bearer guest-token");
});

test("the last activity of a chat on another server is asked from A", async ({
  page,
}) => {
  const { remote } = await routeStory(page, {
    messages: [{ sender: ALICE_A, content: "Hi" }],
  });

  await loginAsMaryAt(page, "/chats");

  await expect.poll(() => remote.heads.length).toBeGreaterThan(0);
  expect(remote.heads[0].url).toBe(
    `${A}/users/${ALICE_A}/documents/${CHAT}/messages`,
  );
  await expect(page.locator("li label")).toHaveText(/\d/);
});

// The bell (ADR 0013 A8): shown only if push is active on this device - a browser subscription
// plus a record in the notification store -, struck through for a chat on another server.
const DEVICE_ID = TestData.mary.devices[0].deviceId;

async function activatePush(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => ({}) },
        }),
      },
      configurable: true,
    });
  });
  await page.goto("/index.html?empty");
  await page.evaluate(
    (deviceId) =>
      window.notificationStore.patch(deviceId, {
        userId: "mary",
        deviceId,
      }),
    DEVICE_ID,
  );
}

test("without push there is no bell", async ({ page }) => {
  await routeStory(page);

  await loginAsMaryAt(page, "/chats");

  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.locator("li i", { hasText: /notifications/ })).toHaveCount(
    0,
  );
});

test("with push the bell of a chat on another server is struck through, in the list and in the chat", async ({
  page,
}) => {
  await routeStory(page);
  await activatePush(page);

  await loginAsMaryAt(page, "/chats");

  const label = "No notifications for chats on a.test";
  await expect(page.getByLabel(label)).toBeVisible();
  await page.getByText("Alice", { exact: true }).click();
  await expect(page.getByLabel(label)).toHaveCount(2);
});

test("a bell follows a change of the push state even if a lookup is under way", async ({
  page,
}) => {
  await routeStory(page);
  await loginAsMaryAt(page, "/chats");
  const label = "No notifications for chats on a.test";
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByLabel(label)).toHaveCount(0);

  // Push is switched on while a lookup that still says "off" is running: that answer is stale.
  await page.evaluate(() => {
    let calls = 0;
    window.pushSubscriptionService.isEnabled = async () => {
      calls++;
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return false;
      }
      return true;
    };
    window.resetPushEnabled();
    window.resetPushEnabled();
  });

  await expect(page.getByLabel(label)).toBeVisible();
});

test("with push the bell of a chat on the own server is a normal one", async ({
  page,
}) => {
  await routeStory(page, {
    contact: alice({
      chatOrigin: undefined,
      self: undefined,
      localUserId: undefined,
      userId: "laura-id",
      owner: MARY_ID,
    }),
  });
  await activatePush(page);

  await loginAsMaryAt(page, "/chats");

  await expect(
    page.locator("li i", { hasText: /^notifications$/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/No notifications/)).toHaveCount(0);
});
