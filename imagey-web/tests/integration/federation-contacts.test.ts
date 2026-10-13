import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  deriveChatKey,
  encryptChatContactInfo,
  encryptedDocument,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  loginAsMaryAt,
  MARY_ID,
  routeGeneratedDocument,
  routeMarysAuth,
  TestData,
} from "./setup";
import { BILL_ID } from "./testdata";
import type {} from "../../src/main";

// Contacts that live on another server (ADR 0013 A11, F7): the inviter must learn where the
// invitee's profile lives, and a contact whose profile cannot be reached stays usable. Chat across
// the server boundary: federated-chat.test.ts (F8).

const CHATS_ID = TestData.mary.settings!.chats;
const A = "https://a.test";
const ALICE_A = "alice-on-a";
const BOB = "bob-on-a"; // local contact whose profile lives elsewhere
const CHAT_ALICE = "chat-alice";
const CHAT_BOB = "chat-bob";
const BOBS_PROFILE = "bobs-public-profile";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

interface Contact {
  userId: string;
  chatId: string;
  owner: string;
  name: string;
  profileRevision: string;
  chatOrigin?: string;
  self?: { userId: string; address: string };
  profileHome?: { origin: string; userId: string };
}

const alice: Contact = {
  userId: ALICE_A,
  chatId: CHAT_ALICE,
  owner: ALICE_A,
  name: "Alice",
  profileRevision: "",
  chatOrigin: A,
  self: { userId: "mary-on-a", address: "mary@imagey.cloud" },
};
const localLaura: Contact = {
  userId: "laura-id",
  chatId: "chat-laura",
  owner: MARY_ID,
  name: "Laura",
  profileRevision: "",
};
const bob = (profileHome?: Contact["profileHome"]): Contact => ({
  userId: BOB,
  chatId: CHAT_BOB,
  owner: MARY_ID,
  name: "Bob",
  profileRevision: "",
  ...(profileHome ? { profileHome } : {}),
});

// Mary with a chat list of `contacts`; returns every request seen below /users.
async function routeChats(page: Page, contacts: Contact[]) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/users/")) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });
  const settingsKey = TestData.mary.settingsKey!;
  const chatsKey = await generateAesGcmKeyJwk();
  await routeMarysAuth(page);
  await routeGeneratedDocument(
    page,
    CHATS_ID,
    await encryptedDocument(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts,
    }),
    MARY_ID,
    await encryptKeyEnvelope(chatsKey, settingsKey),
  );
  await page.route(`**/users/${MARY_ID}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  // The chat with bob, owned by mary; his profile is a document of his.
  const chatKey = await generateAesGcmKeyJwk();
  await routeGeneratedDocument(
    page,
    CHAT_BOB,
    await encryptedDocument(chatKey, {
      type: "chat",
      name: "Chat",
      publicProfiles: { [BOB]: BOBS_PROFILE },
    }),
    CHATS_ID,
    await encryptKeyEnvelope(chatKey, chatsKey),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/${CHAT_BOB}/messages`),
    (route) => route.fulfill({ status: 200, json: [] }),
  );
  await page.route(`**/users/${MARY_ID}/documents/${BOBS_PROFILE}**`, (route) =>
    route.fulfill({ status: 403 }),
  );
  return requests;
}

test("a contact whose profile cannot be read on its server is shown from its snapshot", async ({
  page,
}) => {
  await routeChats(page, [
    bob({ origin: "https://b.test", userId: "bob-on-b" }),
  ]);

  await loginAsMaryAt(page, `/chats/${BOB}`);

  await expect(page.getByLabel("Type a message")).toBeVisible();
  await expect(page.getByText("Bob", { exact: true }).first()).toBeVisible();
});

test("a contact whose profile lives here has it loaded", async ({ page }) => {
  const requests = await routeChats(page, [bob()]);

  await loginAsMaryAt(page, `/chats/${BOB}`);

  await expect(page.getByLabel("Type a message")).toBeVisible();
  await expect
    .poll(() => requests.filter((r) => r.includes(BOBS_PROFILE)).length)
    .toBeGreaterThan(0);
});

test("contacts on other servers can be put into a group if their id here is known", async ({
  page,
}) => {
  await routeChats(page, [
    // the chat is at A and no address is known: no id here can be looked up
    alice,
    bob({ origin: "https://b.test", userId: "x" }),
    localLaura,
  ]);
  await loginAsMaryAt(page, "/chats");
  await expect(page.getByText("Laura", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "group_add" }).click();

  const dialog = page.getByRole("dialog");
  // bob lives here and only has his profile elsewhere
  await expect(dialog.getByRole("checkbox", { name: "Bob" })).toBeEnabled();
  await expect(dialog.getByRole("checkbox", { name: "Laura" })).toBeEnabled();
  await expect(dialog.getByRole("checkbox", { name: "Alice" })).toBeDisabled();
});

// What the inviter learns from the invitee's contactInfo when picking the accepted request up.
const cases: [
  string,
  { origin: string; userId: string } | undefined,
  unknown,
][] = [
  [
    "where the invitee's profile lives",
    { origin: "https://b.test", userId: "bob-on-b" },
    { origin: "https://b.test", userId: "bob-on-b" },
  ],
  ["no home", undefined, undefined],
  [
    "a home that is no secure origin",
    { origin: "http://b.test", userId: "bob-on-b" },
    undefined,
  ],
  ["a home that is no origin", { origin: "nonsense", userId: "x" }, undefined],
  ["a home without an id", { origin: "https://b.test", userId: "" }, undefined],
];
for (const [name, home, expected] of cases) {
  test(`picking up an accepted request keeps ${name}`, async ({ page }) => {
    const chatsKey = await generateAesGcmKeyJwk();
    await routeMarysAuth(page);
    await routeGeneratedDocument(
      page,
      CHATS_ID,
      await encryptedDocument(chatsKey, {
        type: "chatList",
        name: "Chats",
        contacts: [],
      }),
      MARY_ID,
      await encryptKeyEnvelope(chatsKey, TestData.mary.settingsKey!),
    );
    await page.route(`**/users/${MARY_ID}/documents`, (route) =>
      route.fulfill({
        status: 201,
        headers: {
          Location: `/users/${MARY_ID}/documents/chat-picked-up`,
          ETag: '"chats-2"',
        },
      }),
    );
    await page.route(`**/users/${MARY_ID}/documents/pp/keys`, (route) =>
      route.fulfill({ status: 200 }),
    );
    await page.route(
      `**/users/${MARY_ID}/contact-requests/${BILL_ID}`,
      (route) => route.fulfill({ status: 204 }),
    );
    // bill is the invitee here
    const chatKey = await deriveChatKey(
      TestData.bill.privateMainKey!,
      TestData.mary.publicMainKey,
      "chat-picked-up",
      MARY_ID,
      BILL_ID,
    );
    const contactInfo = await encryptChatContactInfo(
      { name: "Bill", email: "bill@b.test", ...(home ? { home } : {}) },
      chatKey,
    );
    await page.goto("/index.html?empty");

    const contact = await page.evaluate(
      async ({ request, settings, mary }) =>
        window.contactService.receiveContactRequest(
          mary.id,
          request,
          { documentId: "pp", key: { kty: "oct", k: "AAAA" } } as never,
          settings,
          mary.keys,
        ),
      {
        request: {
          inviter: MARY_ID,
          invitee: BILL_ID,
          publicKey: TestData.bill.publicMainKey,
          status: "ACCEPTED",
          chatId: "chat-picked-up",
          contactInfo,
        },
        settings: {
          ...TestData.mary.settings!,
          settingsKey: TestData.mary.settingsKey!,
        },
        mary: {
          id: MARY_ID,
          keys: {
            publicKey: TestData.mary.publicMainKey,
            privateKey: TestData.mary.privateMainKey!,
          },
        },
      },
    );

    expect(contact).toMatchObject({
      userId: BILL_ID,
      owner: MARY_ID,
      name: "Bill",
      email: "bill@b.test",
    });
    expect(contact.profileHome).toEqual(expected);
  });
}
