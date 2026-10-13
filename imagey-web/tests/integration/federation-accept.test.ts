import { Page, Route } from "@playwright/test";
import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  aesGcmDecrypt,
  clearLocalStorage,
  deriveChatKey,
  encryptedDocument,
  encryptInvitationContactInfo,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  loginAsMaryAt,
  MARY_ID,
  provider,
  routeGeneratedDocument,
  routeMarysAuth,
  setupMockServer,
  TestData,
} from "./setup";
import type { createFederationGuestTokenProvider } from "../../src/federation/federationGuestTokenProvider";
import type {} from "../../src/main";

// Accepting an invitation of ANOTHER server (ADR 0013 A11, F7): mary has an account on this
// server and is invited by alice, whose account lives at A. A is stubbed with page.route (error
// paths and a foreign origin do not belong into a Pact contract, see AGENTS.md); only the call to
// the own server that is new, POST foreign-principals, is a contract.

declare global {
  interface Window {
    fedProvider: ReturnType<typeof createFederationGuestTokenProvider>;
  }
}

const A = "https://a.test";
const ALICE_A = "alice-on-a"; // alice's id at A
const MARY_A = "mary-on-a"; // mary's id at A
const ALICE_B = "alice-on-b"; // alice's id on the own server
const CHAT = "chat-alice-mary";
const INVITATION_TOKEN = "header.payload.signature";
const MARY_ADDRESS = "mary@imagey.cloud";
const ALICE_ADDRESS = "alice@a.test";
const PENDING_KEY = "imagey.pendingFederatedInvitation";
const PROFILE_ID = TestData.mary.settings!.profile;
const CHATS_ID = TestData.mary.settings!.chats;
const PP_ID = "33333333-3333-3333-3333-333333333333";
const FRAGMENT = `token=${INVITATION_TOKEN}&invited-by=${ALICE_A}&from=${encodeURIComponent(A)}`;
const ACCEPT_URL = `/federation/accept#${FRAGMENT}`;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Location, ETag, Last-Modified",
};

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  bytes: Buffer | null;
}

async function seen(route: Route): Promise<Seen> {
  const request = route.request();
  return {
    method: request.method(),
    url: request.url(),
    headers: await request.allHeaders(),
    body: request.postData(),
    bytes: request.postDataBuffer(),
  };
}

interface Options {
  // alice's address in her contactInfo (none = unknown)
  aliceAddress?: string | null;
  // mary's public profile name ("" = not named yet)
  name?: string;
  // answers of A
  sessionStatus?: number;
  invitations?: "none" | "default";
  assertionStatus?: number;
}

// Everything the app asks the own server and A for in this story. Returns what was seen, in order.
async function routeStory(page: Page, options: Options = {}) {
  const {
    aliceAddress = ALICE_ADDRESS,
    name = "Mary",
    sessionStatus = 200,
    invitations = "default",
    assertionStatus = 200,
  } = options;
  const events: string[] = [];
  const own = {
    foreignPrincipals: [] as Seen[],
    shares: [] as Seen[],
    assertions: [] as Seen[],
    namePuts: [] as Seen[],
  };
  const remote = {
    sessions: [] as Seen[],
    contactRequests: [] as Seen[],
    accepts: [] as Seen[],
    declines: [] as Seen[],
  };
  let chatsContent: Buffer;
  let chatsRevision = 1;

  const settingsKey = TestData.mary.settingsKey!;
  const profileKey = TestData.mary.documents[5].key!;
  const chatsKey = await generateAesGcmKeyJwk();
  const ppKey = await generateAesGcmKeyJwk();
  chatsContent = await encryptedDocument(chatsKey, {
    type: "chatList",
    name: "Chats",
    contacts: [],
  });

  await routeMarysAuth(page);
  await routeGeneratedDocument(
    page,
    PROFILE_ID,
    await encryptedDocument(profileKey, {
      type: "profile",
      emails: [MARY_ADDRESS, "mary@other.test"],
      publicProfileId: PP_ID,
    }),
    MARY_ID,
    await encryptKeyEnvelope(profileKey, settingsKey),
  );
  const ppContent = await encryptedDocument(ppKey, {
    type: "publicProfile",
    name,
  });
  await page.route(`**/users/${MARY_ID}/documents/${PP_ID}`, async (route) => {
    if (route.request().method() === "PUT") {
      own.namePuts.push(await seen(route));
      await route.fulfill({ status: 204, headers: { ETag: '"pp-2"' } });
    } else {
      await route.fulfill({
        status: 200,
        headers: { ETag: '"pp-1"' },
        contentType: "application/octet-stream",
        body: ppContent,
      });
    }
  });
  await page.route(
    `**/users/${MARY_ID}/documents/${PP_ID}/keys/${PROFILE_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(ppKey, profileKey) },
      }),
  );
  // The chats document: reads give what was written last.
  await page.route(
    `**/users/${MARY_ID}/documents/${CHATS_ID}`,
    async (route) => {
      if (route.request().method() === "PUT") {
        events.push("own: store chats");
        chatsContent = (await seen(route)).bytes!;
        chatsRevision++;
        await route.fulfill({
          status: 204,
          headers: { ETag: `"chats-${chatsRevision}"` },
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { ETag: `"chats-${chatsRevision}"` },
          contentType: "application/octet-stream",
          body: chatsContent,
        });
      }
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
    `**/users/${MARY_ID}/documents/${PP_ID}/keys`,
    async (route) => {
      events.push("own: share profile");
      own.shares.push(await seen(route));
      await route.fulfill({ status: 200 });
    },
  );
  await page.route(`**/users/${MARY_ID}/foreign-principals`, async (route) => {
    events.push("own: foreign principal");
    own.foreignPrincipals.push(await seen(route));
    await route.fulfill({ status: 200, json: { userId: ALICE_B } });
  });
  await page.route(
    new RegExp(`/users/${MARY_ID}/federation-assertions$`),
    async (route) => {
      events.push("own: assertion");
      own.assertions.push(await seen(route));
      await route.fulfill(
        assertionStatus === 200
          ? { status: 200, json: { assertion: "a.b.c" } }
          : { status: assertionStatus },
      );
    },
  );

  const contactInfo = await encryptInvitationContactInfo(
    {
      name: "Alice",
      ...(aliceAddress ? { email: aliceAddress } : {}),
    },
    MARY_ADDRESS,
    CHAT,
  );
  await page.route(`${A}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
      events.push("A: redeem");
      remote.sessions.push(await seen(route));
      return respond(
        sessionStatus === 200
          ? {
              status: 200,
              json: { token: "guest-token", userId: MARY_A, expiresIn: 900 },
            }
          : { status: sessionStatus },
      );
    }
    if (path === `/users/${MARY_A}/contact-requests`) {
      events.push("A: list invitations");
      remote.contactRequests.push(await seen(route));
      return respond({
        status: 200,
        json:
          invitations === "none"
            ? []
            : [
                {
                  inviter: ALICE_A,
                  invitee: MARY_A,
                  publicKey: TestData.bill.publicMainKey,
                  status: "INVITED",
                  chatId: CHAT,
                  publicProfileId: "alices-public-profile",
                  contactInfo,
                },
              ],
      });
    }
    if (path === `/users/${MARY_A}/contact-requests/${ALICE_A}`) {
      if (request.method() === "PUT") {
        events.push("A: accept");
        remote.accepts.push(await seen(route));
      } else {
        events.push("A: decline");
        remote.declines.push(await seen(route));
      }
      return respond({ status: 204 });
    }
    return respond({ status: 404 });
  });
  return { events, own, remote, chatsKey, getChats: () => chatsContent };
}

// What mary's client sent as the accepting PUT, read the way alice's client reads it.
async function readAccept(accept: Seen, inviteeId: string) {
  const body = JSON.parse(accept.body!);
  const chatKey = await deriveChatKey(
    TestData.bill.privateMainKey!, // alice's key pair is bill's
    body.publicKey,
    CHAT,
    ALICE_A,
    inviteeId,
  );
  const info = JSON.parse(
    (
      await aesGcmDecrypt(chatKey, Buffer.from(body.contactInfo, "base64"))
    ).toString(),
  );
  return { body, info };
}

const heading = (page: Page) =>
  page.getByRole("heading", { name: "Invitation from a.test" });

// Logs in on the page the invitation link led to.
async function openInvitation(page: Page) {
  await loginAsMaryAt(page, ACCEPT_URL);
  await expect(heading(page)).toBeVisible();
}

async function showInvitation(page: Page) {
  await page.getByRole("button", { name: "Show invitation" }).click();
  await expect(page.getByText("Alice on a.test invites you.")).toBeVisible();
}

const pending = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), PENDING_KEY);

test("a foreign principal is registered on the own server (contract)", async ({
  page,
}) => {
  await provider
    .addInteraction()
    .uponReceiving("a request of mary for the id of a foreign user")
    .withRequest("POST", `/users/${MARY_ID}/foreign-principals`, (r) =>
      r
        .headers({
          "Content-Type": "application/json",
          Accept: "application/json",
        })
        .jsonBody({ domain: "a.test", address: ALICE_ADDRESS }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        userId: MatchersV3.uuid("35c34cb3-559d-4001-a67b-23259e45e69e"),
      }),
    )
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);

      const userId = await page.evaluate(
        ({ userId, address }) =>
          window.federation.federationRepository.registerForeignPrincipal(
            userId,
            "a.test",
            address,
          ),
        { userId: MARY_ID, address: ALICE_ADDRESS },
      );

      expect(userId).toBe("35c34cb3-559d-4001-a67b-23259e45e69e");
    });
});

test("mary accepts an invitation of another server, logging in first", async ({
  page,
}) => {
  const story = await routeStory(page);
  // Not logged in yet: the invitation is taken off the URL before the login starts.
  await page.goto(ACCEPT_URL);
  await expect(page).toHaveURL(/\/federation\/accept$/);
  expect(JSON.parse((await pending(page))!)).toMatchObject({
    token: INVITATION_TOKEN,
    invitedBy: ALICE_A,
    from: A,
  });
  await loginAsMaryAt(page, "/federation/accept");
  await expect(heading(page)).toBeVisible();
  // The address she is signed in with is preselected.
  await expect(page.getByRole("combobox", { name: "Address" })).toHaveValue(
    MARY_ADDRESS,
  );

  await showInvitation(page);
  await expect(page.getByText(ALICE_ADDRESS)).toBeVisible();
  // Redeemed with an assertion for A and the invitation token.
  expect(JSON.parse(story.own.assertions[0].body!)).toEqual({
    aud: "a.test",
    email: MARY_ADDRESS,
  });
  expect(JSON.parse(story.remote.sessions[0].body!)).toEqual({
    assertion: "a.b.c",
    invitationToken: INVITATION_TOKEN,
  });
  expect(story.remote.contactRequests[0].headers["authorization"]).toBe(
    "Bearer guest-token",
  );

  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page).toHaveURL(/\/chats$/);

  // Alice is registered on the own server, the profile is shared with her id there, then A is told.
  expect(story.events).toEqual([
    "own: assertion",
    "A: redeem",
    "A: list invitations",
    "own: foreign principal",
    "own: store chats",
    "own: share profile",
    "A: accept",
  ]);
  expect(JSON.parse(story.own.foreignPrincipals[0].body!)).toEqual({
    domain: "a.test",
    address: ALICE_ADDRESS,
  });
  expect(JSON.parse(story.own.shares[0].body!)).toMatchObject({
    issuer: ALICE_B,
    kid: ALICE_B,
  });
  expect(story.remote.accepts[0].headers["authorization"]).toBe(
    "Bearer guest-token",
  );

  // Alice derives the chat key with mary's id AT A (not her id here), and reads where mary lives.
  const { body, info } = await readAccept(story.remote.accepts[0], MARY_A);
  expect(body).toMatchObject({
    inviter: ALICE_A,
    invitee: MARY_A,
    status: "ACCEPTED",
  });
  expect(info).toEqual({
    name: "Mary",
    email: MARY_ADDRESS,
    home: { origin: "http://localhost:5173", userId: MARY_ID },
  });
  await expect(() =>
    readAccept(story.remote.accepts[0], MARY_ID),
  ).rejects.toThrow();

  // The contact says where its chat is and which id mary has there.
  expect(await pending(page)).toBeNull();
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  const saved = await page.evaluate(
    async ({ key, content }) =>
      JSON.parse(
        new TextDecoder().decode(
          await window.cryptoService.decryptDocument(
            key,
            new Uint8Array(content).buffer,
          ),
        ),
      ),
    { key: story.chatsKey, content: [...story.getChats()] },
  );
  expect(saved.contacts).toHaveLength(1);
  expect(saved.contacts[0]).toMatchObject({
    userId: ALICE_A,
    owner: ALICE_A,
    chatId: CHAT,
    name: "Alice",
    email: ALICE_ADDRESS,
    chatOrigin: A,
    self: { userId: MARY_A, address: MARY_ADDRESS },
  });
  expect(saved.contacts[0].profileHome).toBeUndefined();
});

test("after a reload the address for the foreign server is known again", async ({
  page,
}) => {
  const story = await routeStory(page);
  await loginAsMaryAt(page, "/chats");
  // The chat list holds the contact; make it hold one that lives at A.
  await page.evaluate(() => window.remoteApi.guestSessionStore.clear());
  await page.route(`**/users/${MARY_ID}/documents/${CHATS_ID}`, async (route) =>
    route.fulfill({
      status: 200,
      headers: { ETag: '"chats-9"' },
      contentType: "application/octet-stream",
      body: await encryptedDocument(story.chatsKey, {
        type: "chatList",
        name: "Chats",
        contacts: [
          {
            userId: ALICE_A,
            chatId: CHAT,
            owner: ALICE_A,
            name: "Alice",
            profileRevision: "",
            chatOrigin: A,
            self: { userId: MARY_A, address: "mary@other.test" },
          },
        ],
      }),
    }),
  );
  await page.reload();
  await page
    .getByLabel("Password", { exact: true })
    .fill(TestData.mary.password);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();

  // Renewing the session at A uses the address stored with the contact.
  await page.evaluate(
    ([id]) =>
      window.remoteApi
        .repositoriesFor("https://a.test")
        .contacts.getContactRequests(id),
    [MARY_A],
  );

  expect(JSON.parse(story.own.assertions.at(-1)!.body!)).toEqual({
    aud: "a.test",
    email: "mary@other.test",
  });
});

test("an invitation waiting for a login leads back to its page", async ({
  page,
}) => {
  await routeStory(page);
  await page.evaluate(
    ([key, token]) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          token,
          invitedBy: "alice-on-a",
          from: "https://a.test",
          savedAt: Date.now() - 5 * 60 * 1000,
        }),
      ),
    [PENDING_KEY, INVITATION_TOKEN],
  );

  // The login by mail link ends on "/?email=...": the path is lost.
  await loginAsMaryAt(page, "/");

  await expect(page).toHaveURL(/\/federation\/accept$/);
  await expect(heading(page)).toBeVisible();
});

test("an invitation older than an hour is dropped", async ({ page }) => {
  await routeStory(page);
  await page.evaluate(
    ([key, token]) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          token,
          invitedBy: "alice-on-a",
          from: "https://a.test",
          savedAt: Date.now() - 2 * 60 * 60 * 1000,
        }),
      ),
    [PENDING_KEY, INVITATION_TOKEN],
  );

  await loginAsMaryAt(page, "/");

  await expect(
    page.getByRole("link", { name: "Images" }).first(),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/federation/);
  expect(await pending(page)).toBeNull();
});

test("without an invitation the page says so", async ({ page }) => {
  await routeStory(page);

  await loginAsMaryAt(page, "/federation/accept");

  await expect(
    page.getByRole("heading", { name: "No invitation found" }),
  ).toBeVisible();
});

test("a link that does not name the inviting server is ignored", async ({
  page,
}) => {
  await routeStory(page);

  await loginAsMaryAt(
    page,
    `/federation/accept#token=${INVITATION_TOKEN}&invited-by=${ALICE_A}&from=http%3A%2F%2Fevil.test`,
  );

  await expect(
    page.getByRole("heading", { name: "No invitation found" }),
  ).toBeVisible();
  expect(await pending(page)).toBeNull();
});

test("an incomplete fragment is ignored", async ({ page }) => {
  await routeStory(page);

  await loginAsMaryAt(page, `/federation/accept#token=${INVITATION_TOKEN}`);

  await expect(
    page.getByRole("heading", { name: "No invitation found" }),
  ).toBeVisible();
});

test("a refusal at A is reported and the invitation stays", async ({
  page,
}) => {
  const story = await routeStory(page, { sessionStatus: 401 });
  await openInvitation(page);

  await page.getByRole("button", { name: "Show invitation" }).click();

  await expect(
    page.getByText(
      "The invitation could not be confirmed. Is the address correct?",
    ),
  ).toBeVisible();
  expect(story.remote.contactRequests).toHaveLength(0);
  expect(await pending(page)).not.toBeNull();
});

test("another address is used as typed, an address she does not own is refused", async ({
  page,
}) => {
  const story = await routeStory(page, { assertionStatus: 403 });
  await openInvitation(page);

  await page
    .getByRole("combobox", { name: "Address" })
    .selectOption({ label: "Other address" });
  await page
    .getByRole("textbox", { name: "Address" })
    .fill(" dave@elsewhere.test ");
  await page.getByRole("button", { name: "Show invitation" }).click();

  await expect(
    page.getByText(
      "The invitation could not be confirmed. Is the address correct?",
    ),
  ).toBeVisible();
  expect(JSON.parse(story.own.assertions[0].body!)).toEqual({
    aud: "a.test",
    email: "dave@elsewhere.test",
  });
  expect(story.remote.sessions).toHaveLength(0);
});

test("the button needs an address", async ({ page }) => {
  await routeStory(page);
  await openInvitation(page);

  await page
    .getByRole("combobox", { name: "Address" })
    .selectOption({ label: "Other address" });
  // Starts with the address she is signed in with.
  await expect(page.getByRole("textbox", { name: "Address" })).toHaveValue(
    MARY_ADDRESS,
  );
  await page.getByRole("textbox", { name: "Address" }).fill("");

  await expect(
    page.getByRole("button", { name: "Show invitation" }),
  ).toBeDisabled();
});

test("no matching invitation at A is reported", async ({ page }) => {
  await routeStory(page, { invitations: "none" });
  await openInvitation(page);

  await page.getByRole("button", { name: "Show invitation" }).click();

  await expect(
    page.getByText("No matching invitation was found"),
  ).toBeVisible();
});

test("without alice's address the profile is not shared, accepting still works", async ({
  page,
}) => {
  const story = await routeStory(page, { aliceAddress: null });
  await openInvitation(page);
  await page.getByRole("button", { name: "Show invitation" }).click();
  await expect(page.getByText("Alice on a.test invites you.")).toBeVisible();

  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page).toHaveURL(/\/chats$/);

  expect(story.own.foreignPrincipals).toHaveLength(0);
  expect(story.own.shares).toHaveLength(0);
  expect(story.remote.accepts).toHaveLength(1);
});

test("a name is asked for first when mary has none", async ({ page }) => {
  const story = await routeStory(page, { name: "" });
  await openInvitation(page);
  await showInvitation(page);

  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByLabel("Name").fill("Mary M.");
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page).toHaveURL(/\/chats$/);
  expect(story.own.namePuts).toHaveLength(1);
  const { info } = await readAccept(story.remote.accepts[0], MARY_A);
  expect(info.name).toBe("Mary M.");
});

test("an accept that fails is reported and can be retried", async ({
  page,
}) => {
  const story = await routeStory(page);
  await openInvitation(page);
  await showInvitation(page);
  await page.route(
    `${A}/users/${MARY_A}/contact-requests/${ALICE_A}`,
    (route) =>
      route.request().method() === "OPTIONS"
        ? route.fallback()
        : route.fulfill({ status: 500, headers: CORS }),
  );

  await page.getByRole("button", { name: "Accept" }).click();

  await expect(
    page.getByText("Could not accept the invitation."),
  ).toBeVisible();
  expect(await pending(page)).not.toBeNull();
  expect(story.remote.accepts).toHaveLength(0);
});

test("mary declines at A", async ({ page }) => {
  const story = await routeStory(page);
  await openInvitation(page);
  await showInvitation(page);

  await page.getByRole("button", { name: "Decline" }).click();

  await expect(page).not.toHaveURL(/federation/);
  expect(story.remote.declines).toHaveLength(1);
  expect(story.remote.declines[0].headers["authorization"]).toBe(
    "Bearer guest-token",
  );
  expect(story.remote.accepts).toHaveLength(0);
  expect(await pending(page)).toBeNull();
});

test("a decline that fails is reported", async ({ page }) => {
  await routeStory(page);
  await openInvitation(page);
  await showInvitation(page);
  await page.route(
    `${A}/users/${MARY_A}/contact-requests/${ALICE_A}`,
    (route) =>
      route.request().method() === "OPTIONS"
        ? route.fallback()
        : route.fulfill({ status: 500, headers: CORS }),
  );

  await page.getByRole("button", { name: "Decline" }).click();

  await expect(
    page.getByText("Could not decline the invitation."),
  ).toBeVisible();
});

test("cancelling forgets the invitation", async ({ page }) => {
  await routeStory(page);
  await openInvitation(page);

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page).not.toHaveURL(/federation/);
  expect(await pending(page)).toBeNull();
});

test("a profile that cannot be loaded is reported", async ({ page }) => {
  await routeStory(page);
  await page.route(`**/users/${MARY_ID}/documents/${PROFILE_ID}`, (route) =>
    route.fulfill({ status: 500 }),
  );
  await openInvitation(page);

  await expect(page.getByText("Could not load your profile.")).toBeVisible();
});

test("switching to another user forgets the invitation", async ({ page }) => {
  await page.route(`**/users/${MARY_ID}/public-keys/0`, (route) =>
    route.fulfill({ status: 200, json: TestData.mary.publicMainKey }),
  );
  await page.evaluate(
    ([key, token]) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          token,
          invitedBy: "alice-on-a",
          from: "https://a.test",
          savedAt: Date.now(),
        }),
      ),
    [PENDING_KEY, INVITATION_TOKEN],
  );
  // No device is known for mary: the app asks her to register one and offers to switch.
  await page.goto(`/?email=${MARY_ADDRESS}&userId=${MARY_ID}`);

  await page.getByText("Sign in with a different email").click();

  await expect(page.getByPlaceholder("email@imagey.cloud")).toBeVisible();
  expect(await pending(page)).toBeNull();
});
