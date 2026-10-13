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
  loginAsMaryAt,
  messageId,
  messageTimestamp,
  MARY_ID,
  routeMarysAuth,
  TestData,
} from "./setup";

// Groups with members on other servers (ADR 0019 amendment, F9). Mary has her account on the own
// server; alice has hers at A, where the chat of the two lives. A is stubbed with page.route: a
// foreign origin does not belong into a Pact contract (AGENTS.md); the calls to the own server
// that are not new are contracts elsewhere (groups.test.ts).

const A = "https://a.test";
const ALICE_A = "alice-on-a"; // alice's id at A
const MARY_A = "mary-on-a"; // mary's id at A
const CAROL_A = "carol-on-a"; // another member of alice's group, only known by name
const ALICE_B = "alice-on-b"; // alice's id on the own server
const CHAT = "chat-alice-mary";
const GROUP = "group-team";
const ALICE_PP = "alices-public-profile";
const MARY_ADDRESS = "mary@imagey.cloud";
const CHATS_ID = TestData.mary.settings!.chats;
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
  contact?: Contact;
  // The groups already in mary's chat list.
  groups?: object[];
  // Whether mary owns the group (on the own server) - else alice does (at A).
  owned?: boolean;
  // The messages of the group (at A, or on the own server if owned).
  groupMessages?: { sender: string; content: string }[];
  // The members of mary's own group, if more than herself.
  members?: string[];
  // Mary has joined alice's group at A, with an entry that does not know her address there
  // (her chat with alice is local).
  joinedWithoutAddress?: boolean;
  // Alice invites mary through their local chat into her group at A; `address` is what the
  // invitation says mary is registered under there.
  localChat?: { address?: string; registeredAs?: string };
  // The key entry of mary for alice's group at A is refused once (a failing join).
  groupKeyFailsOnce?: boolean;
  // The server the invitation in the chat names for the group.
  invitationOrigin?: string;
}

// Everything the app asks the own server and A for. Returns what was seen.
async function routeStory(page: Page, story: Story = {}) {
  const {
    contact = alice(),
    groups = [],
    owned = false,
    groupMessages = [],
    invitationOrigin,
    members,
    joinedWithoutAddress = false,
    localChat,
    groupKeyFailsOnce = false,
  } = story;
  const own = {
    keyEntries: [] as Seen[],
    principals: [] as Seen[],
    groupPuts: [] as Buffer[],
    chatsPuts: [] as Buffer[],
    messages: [] as Seen[],
    assertions: [] as Seen[],
  };
  const remote = {
    sessions: [] as Seen[],
    groupDocument: [] as Seen[],
    groupMessages: [] as Seen[],
    posts: [] as Seen[],
    profile: [] as Seen[],
  };
  const settingsKey = TestData.mary.settingsKey!;
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();
  const groupKey = await generateAesGcmKeyJwk();
  const ppKey = await generateAesGcmKeyJwk();
  let chatsContent = await encryptedDocument(chatsKey, {
    type: "chatList",
    name: "Chats",
    contacts: [
      joinedWithoutAddress || localChat
        ? alice({
            chatOrigin: undefined,
            self: undefined,
            localUserId: undefined,
            userId: "alice-local",
            owner: MARY_ID,
            ...(localChat
              ? { profileHome: { origin: A, userId: ALICE_A } }
              : {}),
          })
        : contact,
    ],
    groups: joinedWithoutAddress
      ? [
          {
            groupId: GROUP,
            owner: ALICE_A,
            name: "Team",
            groupKey,
            chatOrigin: A,
            self: { userId: MARY_A },
          },
        ]
      : groups,
  });
  let chatsRevision = 1;

  await routeMarysAuth(page);
  await page.route(
    `**/users/${MARY_ID}/documents/${CHATS_ID}`,
    async (route) => {
      if (route.request().method() === "PUT") {
        chatsContent = route.request().postDataBuffer()!;
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
      // the assertion says which address it is for, so that A can tell them apart
      const email = JSON.parse(route.request().postData() ?? "{}").email;
      await route.fulfill({ status: 200, json: { assertion: email } });
    },
  );
  await page.route(`**/users/${MARY_ID}/foreign-principals`, async (route) => {
    own.principals.push(await seen(route));
    await route.fulfill({ status: 200, json: { userId: ALICE_B } });
  });
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/[^/]+/keys$`),
    async (route) => {
      own.keyEntries.push(await seen(route));
      await route.fulfill({ status: 200 });
    },
  );

  // mary's own group (owned story): the document, its key under her chats key, its messages.
  const groupMetadata = {
    type: "group",
    name: "Team",
    members: owned ? (members ?? [MARY_ID]) : [ALICE_A, MARY_A, CAROL_A],
    publicProfiles: owned ? {} : { [ALICE_A]: ALICE_PP },
    ...(owned ? {} : { memberNames: { [CAROL_A]: "Carol" } }),
  };
  const groupContent = await encryptedDocument(groupKey, groupMetadata);
  let groupRevision = 1;
  await page.route(`**/users/${MARY_ID}/documents/${GROUP}`, async (route) => {
    if (route.request().method() === "PUT") {
      own.groupPuts.push(route.request().postDataBuffer()!);
      groupRevision++;
      await route.fulfill({
        status: 204,
        headers: { ETag: `"group-${groupRevision}"` },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ETag: `"group-${groupRevision}"` },
      contentType: "application/octet-stream",
      body: groupContent,
    });
  });
  await page.route(
    `**/users/${MARY_ID}/documents/${GROUP}/keys/${CHATS_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(groupKey, chatsKey) },
      }),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/${GROUP}/messages`),
    async (route) => {
      own.messages.push(await seen(route));
      await route.fulfill({ status: 200, json: [] });
    },
  );

  const encrypt = (key: JsonWebKey, list: Story["groupMessages"]) =>
    Promise.all(
      (list ?? []).map(async (m, i) => ({
        id: messageId(i + 1),
        timestamp: messageTimestamp(i + 1),
        sender: m.sender,
        content: await text(key, m.content),
      })),
    );
  const encryptedGroupMessages = await encrypt(groupKey, groupMessages);
  // The 1:1 chat at A carries the invitation (unless mary owns the group).
  const chatMessages = await encrypt(
    chatKey,
    owned
      ? []
      : [
          {
            sender: ALICE_A,
            content: JSON.stringify({
              type: "group-invitation",
              groupId: GROUP,
              owner: ALICE_A,
              name: "Team",
              ...(invitationOrigin ? { origin: invitationOrigin } : {}),
              ...(localChat
                ? {
                    origin: A,
                    ...(localChat.address
                      ? { address: localChat.address }
                      : {}),
                  }
                : {}),
            }),
          },
        ],
  );
  // alice's chat with mary on the own server, in the localChat story
  await page.route(`**/users/${MARY_ID}/documents/${CHAT}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: chatContentLocal,
    }),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/${CHAT}/keys/${CHATS_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(chatKey, chatsKey) },
      }),
  );
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents/${CHAT}/messages`),
    (route) =>
      route.fulfill({
        status: 200,
        json: route.request().url().includes("sinceId") ? [] : chatMessages,
      }),
  );
  const chatContentLocal = await encryptedDocument(chatKey, {
    type: "chat",
    name: "Chat",
    publicProfiles: {},
  });
  const chatContent = await encryptedDocument(chatKey, {
    type: "chat",
    name: "Chat",
    publicProfiles: { [MARY_A]: "marys-public-profile", [ALICE_A]: ALICE_PP },
  });
  const profileContent = await encryptedDocument(ppKey, {
    type: "publicProfile",
    name: "Alice",
  });

  let keyRefused = false;
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
      const s = await seen(route);
      remote.sessions.push(s);
      // alice registered mary under her second address only: A knows no mary for the other
      const address =
        localChat?.registeredAs ?? localChat?.address ?? MARY_ADDRESS;
      if (JSON.parse(s.body ?? "{}").assertion !== address) {
        return respond({ status: 403 });
      }
      return respond({
        status: 200,
        json: { token: "guest-token", userId: MARY_A, expiresIn: 900 },
      });
    }
    const documents = `/users/${ALICE_A}/documents`;
    if (path === `${documents}/${CHAT}`) {
      return respond({
        status: 200,
        contentType: "application/octet-stream",
        body: chatContent,
      });
    }
    if (path === `${documents}/${CHAT}/keys/${MARY_A}`) {
      return respond({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(chatKey, chatsKey) },
      });
    }
    if (path === `${documents}/${CHAT}/messages`) {
      const s = await seen(route);
      if (request.method() === "HEAD") {
        return respond({
          status: 200,
          headers: {
            "Last-Modified": new Date(messageTimestamp(1)).toUTCString(),
          },
        });
      }
      if (request.method() === "POST") {
        remote.posts.push(s);
        return respond({
          status: 201,
          headers: { Location: `${path}/${messageId(99)}` },
          json: { timestamp: messageTimestamp(99) },
        });
      }
      return respond({
        status: 200,
        json: url.searchParams.has("sinceId") ? [] : chatMessages,
      });
    }
    // alice's group at A: members read it as guests, with the key entry filed under their id.
    if (path === `${documents}/${GROUP}`) {
      remote.groupDocument.push(await seen(route));
      return respond({
        status: 200,
        headers: { ETag: '"group-1"' },
        contentType: "application/octet-stream",
        body: groupContent,
      });
    }
    if (path === `${documents}/${GROUP}/keys/${MARY_A}`) {
      if (groupKeyFailsOnce && !keyRefused) {
        keyRefused = true;
        return respond({ status: 403 });
      }
      return respond({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(groupKey, chatKey) },
      });
    }
    if (path === `${documents}/${GROUP}/messages`) {
      const s = await seen(route);
      if (request.method() === "HEAD") {
        return respond({ status: 200 });
      }
      if (request.method() === "POST") {
        remote.posts.push(s);
        return respond({
          status: 201,
          headers: { Location: `${path}/${messageId(98)}` },
          json: { timestamp: messageTimestamp(98) },
        });
      }
      remote.groupMessages.push(s);
      return respond({
        status: 200,
        json: url.searchParams.has("sinceId") ? [] : encryptedGroupMessages,
      });
    }
    // alice's profile, shared into her group: reached with the Access-Path, key under the group.
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
    if (path === `${documents}/${ALICE_PP}/keys/${GROUP}`) {
      return respond({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(ppKey, groupKey) },
      });
    }
    return respond({ status: 404 });
  });
  return {
    own,
    remote,
    ownAssertionAddresses: () =>
      own.assertions.map((a) => JSON.parse(a.body ?? "{}").email),
    groupKey,
    chatKey,
    chatsKey,
    getChats: () => chatsContent,
  };
}

const bubble = (page: Page, content: string) =>
  page.locator("div.elevate", { hasText: content });

test("mary joins alice's group at A as a guest and reads and writes there", async ({
  page,
}) => {
  const { own, remote, groupKey, chatsKey } = await routeStory(page, {
    groupMessages: [
      { sender: CAROL_A, content: "Hi all" },
      { sender: ALICE_A, content: "Welcome" },
      { sender: MARY_A, content: "Thanks" },
    ],
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  // The entry says where the group is and who mary is there; no profile is shared into it.
  const storedLists = async () =>
    Promise.all(
      own.chatsPuts.map(async (put) =>
        JSON.parse((await aesGcmDecrypt(chatsKey, put)).toString()),
      ),
    );
  await expect
    .poll(async () => (await storedLists()).some((l) => l.groups.length === 1))
    .toBe(true);
  const stored = (await storedLists()).find((l) => l.groups.length === 1);
  expect(stored.groups).toHaveLength(1);
  expect(stored.groups[0]).toMatchObject({
    groupId: GROUP,
    owner: ALICE_A,
    chatOrigin: A,
    self: { userId: MARY_A, address: MARY_ADDRESS },
  });
  expect(stored.groups[0].groupKey).toEqual(groupKey);
  expect(own.keyEntries).toEqual([]);

  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(`/chats/groups/${GROUP}`);

  // Own messages (sender: her id AT A) on the right, the others on the left ...
  await expect(bubble(page, "Thanks")).toHaveCSS("align-self", "flex-end");
  await expect(bubble(page, "Hi all")).toHaveCSS("align-self", "flex-start");
  // ... carol is only known by name (the snapshot in the group), alice has a profile at A
  await expect(bubble(page, "Hi all").getByText("Carol")).toBeVisible();
  await expect(bubble(page, "Welcome").getByText("Alice")).toBeVisible();
  expect(remote.groupMessages[0].headers["authorization"]).toBe(
    "Bearer guest-token",
  );
  expect(remote.profile.some((request) => request.headers["access-path"])).toBe(
    true,
  );

  // Sharing an image is not possible there
  await expect(
    page.getByRole("button", { name: "attach_file", exact: true }),
  ).toBeDisabled();

  await page.getByLabel("Type a message").fill("Hello again");
  await page.getByLabel("Type a message").press("Enter");
  await expect(bubble(page, "Hello again")).toHaveCSS("align-self", "flex-end");
  const post = remote.posts.at(-1)!;
  expect(post.url).toBe(`${A}/users/${ALICE_A}/documents/${GROUP}/messages`);
  // the other members are notified by their ids at A, not mary herself
  expect(post.headers["notify"].split(",").sort()).toEqual(
    [ALICE_A, CAROL_A].sort(),
  );
  expect(
    (
      await aesGcmDecrypt(groupKey, Buffer.from(post.body!, "base64"))
    ).toString(),
  ).toBe("Hello again");
  // nothing of the group touches the own server
  expect(own.messages).toEqual([]);
});

test("mary adds alice from A to her own group", async ({ page }) => {
  const { own, remote, chatKey, groupKey } = await routeStory(page, {
    // an entry from before F8 knows no id of alice here: it is looked up
    contact: alice({ localUserId: undefined }),
    groups: [{ groupId: GROUP, owner: MARY_ID, name: "Team" }],
    owned: true,
  });

  await loginAsMaryAt(page, `/chats/groups/${GROUP}`);
  await page.getByRole("button", { name: "person_add", exact: true }).click();
  await page.getByRole("checkbox", { name: "Alice", exact: true }).check();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect.poll(() => remote.posts.length).toBe(1);
  // the member is alice's id on the own server, with her name for the others
  // registering is idempotent: once for the dialog's filter, once for adding
  expect(own.principals.length).toBeGreaterThan(0);
  const metadata = JSON.parse(
    (await aesGcmDecrypt(groupKey, own.groupPuts.at(-1)!)).toString(),
  );
  expect(metadata.members).toEqual([MARY_ID, ALICE_B]);
  expect(metadata.memberNames).toEqual({ [ALICE_B]: "Alice" });
  expect(metadata.publicProfiles).toEqual({});
  const entry = JSON.parse(own.keyEntries.at(-1)!.body!);
  expect(entry).toMatchObject({ issuer: ALICE_B, kid: ALICE_B });

  // the invitation goes into the chat at A and says where the group is
  const post = remote.posts[0];
  expect(post.url).toBe(`${A}/users/${ALICE_A}/documents/${CHAT}/messages`);
  expect(post.headers["notify"]).toBe(ALICE_A);
  const invitation = JSON.parse(
    (
      await aesGcmDecrypt(chatKey, Buffer.from(post.body!, "base64"))
    ).toString(),
  );
  expect(invitation).toMatchObject({
    type: "group-invitation",
    groupId: GROUP,
    owner: MARY_ID,
    name: "Team",
    origin: new URL(page.url()).origin,
    address: "alice@a.test",
  });
});

test("a group invitation naming a server the contact does not live on is not followed", async ({
  page,
}) => {
  const EVIL = "https://evil.test";
  const seenByEvil: string[] = [];
  await page.route(`${EVIL}/**`, (route) => {
    seenByEvil.push(route.request().url());
    return route.fulfill({ status: 404, headers: CORS });
  });
  const { own, chatsKey } = await routeStory(page, {
    invitationOrigin: EVIL,
  });

  await loginAsMaryAt(page, `/chats/${ALICE_A}`);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(seenByEvil).toEqual([]);
  for (const put of own.chatsPuts) {
    const stored = JSON.parse((await aesGcmDecrypt(chatsKey, put)).toString());
    expect(stored.groups ?? []).toEqual([]);
  }
});

test("a group at A joined without a known address is still read after a reload", async ({
  page,
}) => {
  const { remote } = await routeStory(page, {
    joinedWithoutAddress: true,
    groupMessages: [{ sender: CAROL_A, content: "Hi all" }],
  });

  // a deep link: nothing is remembered about the address; the account's own is used
  await loginAsMaryAt(page, `/chats/groups/${GROUP}`);

  await expect(bubble(page, "Hi all")).toBeVisible();
  expect(remote.sessions.length).toBeGreaterThan(0);
});

test("a contact from A who is a member already is neither invited nor shared with again", async ({
  page,
}) => {
  const { own, remote } = await routeStory(page, {
    // no id of alice here in the entry: it is only known once it is looked up
    contact: alice({ localUserId: undefined }),
    groups: [{ groupId: GROUP, owner: MARY_ID, name: "Team" }],
    owned: true,
    members: [MARY_ID, ALICE_B],
  });

  await loginAsMaryAt(page, `/chats/groups/${GROUP}`);
  await page.getByRole("button", { name: "person_add", exact: true }).click();
  await page.getByRole("checkbox", { name: "Alice", exact: true }).check();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Already a member: Alice")).toBeVisible();
  expect(own.principals.length).toBeGreaterThan(0);
  expect(own.keyEntries).toEqual([]);
  expect(own.groupPuts).toEqual([]);
  expect(remote.posts).toEqual([]);
});

test("opening the dialog registers nobody on the server", async ({ page }) => {
  const { own } = await routeStory(page, {
    contact: alice({ localUserId: undefined }),
    groups: [{ groupId: GROUP, owner: MARY_ID, name: "Team" }],
    owned: true,
  });

  await loginAsMaryAt(page, `/chats/groups/${GROUP}`);
  await page.getByRole("button", { name: "person_add", exact: true }).click();

  await expect(page.getByRole("checkbox", { name: "Alice" })).toBeVisible();
  expect(own.principals).toEqual([]);
});

test("joining is refused if the account is known by another address at that server", async ({
  page,
}) => {
  // alice registered mary under her second address, but a session at A exists already (from
  // alice's profile) under the account's own: only one address is kept per server
  const { own, chatsKey, remote } = await routeStory(page, {
    localChat: {
      address: "mary.second@example.org",
      registeredAs: MARY_ADDRESS,
    },
    groupMessages: [],
  });

  await loginAsMaryAt(page, "/chats/alice-local");
  await expect.poll(() => remote.sessions.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(
    page.getByText(/You are known by another address on that server/),
  ).toBeVisible();
  // asking again would end the same way
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  for (const put of own.chatsPuts) {
    const stored = JSON.parse((await aesGcmDecrypt(chatsKey, put)).toString());
    expect(stored.groups ?? []).toEqual([]);
  }
});

test("a join that fails after the address was taken in leaves nothing behind", async ({
  page,
}) => {
  // alice registered mary under her second address; the first try fails at the group key
  const { remote } = await routeStory(page, {
    localChat: { address: "mary.second@example.org" },
    groupKeyFailsOnce: true,
    groupMessages: [{ sender: CAROL_A, content: "Hi all" }],
  });

  await loginAsMaryAt(page, "/chats/alice-local");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  // neither the address nor the session it made stay: the second try is not refused
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(bubble(page, "Hi all")).toBeVisible();
  expect(remote.sessions.length).toBeGreaterThan(1);
});
