import { MatchersV3 } from "@pact-foundation/pact";
import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  setupMarysDevice,
  inputMarysPassword,
  setupMockServer,
  provider,
  runningPactRequests,
  TestData,
  aesGcmEncrypt,
  encryptKeyEnvelope,
  encryptKeyEnvelopeEcdh,
  generateAesGcmKeyJwk,
  encryptInvitationContactInfo,
} from "./setup";
import type { deviceService } from "../../src/device/DeviceService";
import type { contactService } from "../../src/contact/ContactService";
import type { documentService } from "../../src/document/DocumentService";
import type { publicProfileService } from "../../src/profile/publicProfileService";

declare global {
  interface Window {
    deviceService: typeof deviceService;
    contactService: typeof contactService;
    documentService: typeof documentService;
    publicProfileService: typeof publicProfileService;
  }
}

// This file covers error/edge-case scenarios that are hard or pointless to
// express as a Pact contract - typically a genuinely malformed or missing
// response, or a purely local pre-condition failure, that a real provider
// implementation would never intentionally produce. Everything here is
// driven either through Playwright's page.route() (see setup.ts's
// setupMockServer/provider for the contract-based approach used everywhere
// else) or by calling a service directly on `window` (main.tsx exposes the
// services in DEV) so the exact error branch runs in the browser where
// coverage is collected.

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

// Runs `browserFn(arg)` in the page and returns the thrown/rejected
// message, or the sentinel "<resolved>" if it unexpectedly succeeded.
// `browserFn` is serialized by Playwright and executed in the browser, so
// it must not close over anything - pass runtime values via `arg`.
async function messageFromBrowser<A = undefined>(
  page: Page,
  browserFn: (arg: A) => Promise<unknown>,
  arg?: A,
): Promise<string> {
  return page.evaluate(
    async ({ source, arg }) => {
      const call = new Function("arg", `return (${source})(arg)`) as (
        a: unknown,
      ) => Promise<unknown>;
      try {
        await call(arg);
        return "<resolved>";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    { source: browserFn.toString(), arg: (arg ?? null) as A },
  );
}

const MARY = "d20cf443-4f96-418f-a957-c8cbef8677c3";

// The minimum set of endpoints App.tsx hits to decrypt Mary's keys and load
// her settings document (getSettings). Enough to render the logged-in shell;
// page-specific fetches are left to the caller.
async function routeMarysAuth(page: Page) {
  const deviceId = TestData.mary.devices[0].deviceId;
  await page.route(`**/users/${MARY}/public-keys/0`, (route) =>
    route.fulfill({ status: 200, json: TestData.mary.publicMainKey }),
  );
  await page.route(
    `**/users/${MARY}/devices/${deviceId}/private-keys/0`,
    (route) =>
      route.fulfill({
        status: 200,
        json: {
          kid: "0",
          encryptingDeviceId: deviceId,
          key: TestData.mary.devices[0].encryptedPrivateMainKey,
        },
      }),
  );
  await page.route(
    `**/users/${MARY}/devices/${deviceId}/public-keys/0`,
    (route) =>
      route.fulfill({
        status: 200,
        json: TestData.mary.devices[0].publicDeviceKey,
      }),
  );
  await page.route(`**/users/${MARY}/documents/${MARY}`, (route) =>
    route.fulfill({
      status: 200,
      path: "tests/images/encrypted/d20cf443-4f96-418f-a957-c8cbef8677c3/document.enc",
    }),
  );
  await page.route(`**/users/${MARY}/documents/${MARY}/keys/0`, (route) =>
    route.fulfill({
      status: 200,
      path: "tests/images/encrypted/d20cf443-4f96-418f-a957-c8cbef8677c3/keys/0.json",
    }),
  );
}

async function loginMary(
  page: Page,
  extraRoutes?: (page: Page) => Promise<void>,
) {
  await setupMarysDevice(page);
  await routeMarysAuth(page);
  if (extraRoutes) {
    await extraRoutes(page);
  }
  await page.goto("/");
  await inputMarysPassword(page);
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
}

// -------------------------------------------------------------------------
// DeviceService - local pre-condition failures (no valid deviceId / device
// key in localStorage). deviceService is on window in DEV.
// -------------------------------------------------------------------------

test.describe("DeviceService error paths", () => {
  test("activateDevice rejects when this device has no local deviceId", async ({
    page,
  }) => {
    await setupMarysDevice(page);
    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );
    await page.evaluate(() =>
      localStorage.removeItem(
        "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
      ),
    );

    const message = await messageFromBrowser(page, () =>
      window.deviceService.activateDevice(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        "some-other-device",
        {} as JsonWebKey,
        {} as JsonWebKey,
      ),
    );

    expect(message).toBe("deviceId not found");
  });

  test("unlockDevice rejects when this device has no local deviceId", async ({
    page,
  }) => {
    await setupMarysDevice(page);
    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );
    await page.evaluate(() =>
      localStorage.removeItem(
        "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
      ),
    );

    const message = await messageFromBrowser(page, () =>
      window.deviceService.unlockDevice(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        "password",
      ),
    );

    expect(message).toBe("DeviceId missing");
  });

  test("unlockDevice rejects when the local device key is gone", async ({
    page,
  }) => {
    await setupMarysDevice(page);
    const deviceId = TestData.mary.devices[0].deviceId;
    // unlockDevice fetches the public device key before it checks the
    // private one, so that call has to succeed for us to reach the branch
    // under test.
    await page.route(
      `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${deviceId}/public-keys/0`,
      (route) =>
        route.fulfill({
          status: 200,
          json: TestData.mary.devices[0].publicDeviceKey,
        }),
    );
    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );
    await page.evaluate(
      (id) => localStorage.removeItem(`imagey.devices[${id}].key`),
      deviceId,
    );

    const message = await messageFromBrowser(page, () =>
      window.deviceService.unlockDevice(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        "password",
      ),
    );

    expect(message).toBe("Private Key missing");
  });

  test("unlockLocalDeviceKey rejects when the local device key is gone", async ({
    page,
  }) => {
    await setupMarysDevice(page);
    const deviceId = TestData.mary.devices[0].deviceId;
    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );
    await page.evaluate(
      (id) => localStorage.removeItem(`imagey.devices[${id}].key`),
      deviceId,
    );

    const message = await messageFromBrowser(
      page,
      (id: string) => window.deviceService.unlockLocalDeviceKey(id, "password"),
      deviceId,
    );

    expect(message).toBe("Private Key missing");
  });
});

// -------------------------------------------------------------------------
// ContactService - malformed request / unreadable "chats" document.
// -------------------------------------------------------------------------

test.describe("ContactService error paths", () => {
  test("readInvitationInfo resolves to what it can read, never rejects", async ({
    page,
  }) => {
    const chatId = "chat-info";
    const odd = await encryptInvitationContactInfo(
      { name: 42, email: "" } as unknown as { name: string; email: string },
      "mary@imagey.cloud",
      chatId,
    );
    const padded = await encryptInvitationContactInfo(
      { name: "  Bill  ", email: 7 } as unknown as {
        name: string;
        email: string;
      },
      "mary@imagey.cloud",
      chatId,
    );
    await page.goto("/");

    const results = await page.evaluate(
      async ({ chatId, odd, padded }) => {
        const read = (contactInfo: string | undefined, email?: string) =>
          window.contactService.readInvitationInfo(
            { chatId, contactInfo },
            email,
          );
        return {
          // no own address known - nothing to derive the key from
          noOwnEmail: await read(odd),
          // an older request without contact info
          noContactInfo: await read(undefined, "mary@imagey.cloud"),
          // invited under a different address - the key doesn't fit
          wrongAddress: await read(odd, "other@imagey.cloud"),
          // decryptable, but not strings / blank
          odd: await read(odd, "mary@imagey.cloud"),
          padded: await read(padded, "MARY@imagey.cloud"),
        };
      },
      { chatId, odd, padded },
    );

    expect(results).toEqual({
      noOwnEmail: {},
      noContactInfo: {},
      wrongAddress: {},
      odd: {},
      padded: { name: "Bill" },
    });
  });

  test("acceptContactRequest rejects when the chats document can't be loaded", async ({
    page,
  }) => {
    // documentService.loadDocument() rejects with a DocumentLoadError on the
    // 500, which propagates straight out of acceptContactRequest.
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chats-broken",
      (route) => route.fulfill({ status: 500 }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.contactService.acceptContactRequest(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        {
          inviter: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
          chatId: "chat-1",
          publicKey: {} as JsonWebKey,
        },
        "mary@imagey.cloud",
        { documentId: "pp", key: {} as JsonWebKey },
        {
          documents: "docs",
          chats: "chats-broken",
          profile: "profile",
          settingsKey: {} as JsonWebKey,
        },
        {
          publicKey: {} as JsonWebKey,
          privateKey: {} as JsonWebKey,
        },
      ),
    );

    expect(message).toBe("Failed to load document chats-broken");
  });

  test("acceptContactRequest rejects when the chats document isn't actually a chatList", async ({
    page,
  }) => {
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const chatsKey = await generateAesGcmKeyJwk();
    const settingsKey = await generateAesGcmKeyJwk();
    const content = await aesGcmEncrypt(
      chatsKey,
      new TextEncoder().encode(
        JSON.stringify({ type: "folder", name: "Not Chats", documents: [] }),
      ),
    );
    const wrappedKey = await encryptKeyEnvelope(chatsKey, settingsKey);
    await page.route(`**/users/${userId}/documents/chats-wrong-type`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: content,
      }),
    );
    await page.route(
      `**/users/${userId}/documents/chats-wrong-type/keys/${userId}`,
      (route) =>
        route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
    );
    await page.goto("/");

    const message = await page.evaluate(
      async ({ userId, settingsKey }) => {
        try {
          await window.contactService.acceptContactRequest(
            userId,
            {
              inviter: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
              chatId: "chat-1",
              publicKey: {} as JsonWebKey,
            },
            "mary@imagey.cloud",
            { documentId: "pp", key: {} as JsonWebKey },
            {
              documents: "docs",
              chats: "chats-wrong-type",
              profile: "profile",
              settingsKey: settingsKey as JsonWebKey,
            },
            { publicKey: {} as JsonWebKey, privateKey: {} as JsonWebKey },
          );
          return "<resolved>";
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
      { userId, settingsKey },
    );

    expect(message).toBe(
      'Expected the "chats" document to be a chatList, got folder',
    );
  });

  test("receiveContactRequest rejects when the chats document can't be loaded", async ({
    page,
  }) => {
    // The invitee's wrapped key is opaque to the inviter - any value will do.
    const chatKey = await generateAesGcmKeyJwk();
    const wrappedChatKey = await encryptKeyEnvelopeEcdh(
      chatKey,
      TestData.mary.privateMainKey!,
      TestData.mary.publicMainKey,
    );
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chats-broken",
      (route) => route.fulfill({ status: 500 }),
    );
    await page.goto("/");

    const message = await page.evaluate(
      async ({ wrappedChatKey, pub, priv }) => {
        try {
          await window.contactService.receiveContactRequest(
            "d20cf443-4f96-418f-a957-c8cbef8677c3",
            {
              inviter: "d20cf443-4f96-418f-a957-c8cbef8677c3",
              invitee: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
              publicKey: pub as JsonWebKey,
              status: "ACCEPTED",
              chatId: "chat-1",
              sharedKey: wrappedChatKey,
            },
            { documentId: "pp", key: pub as JsonWebKey },
            {
              documents: "docs",
              chats: "chats-broken",
              profile: "profile",
              settingsKey: {} as JsonWebKey,
            },
            { publicKey: pub as JsonWebKey, privateKey: priv as JsonWebKey },
          );
          return "<resolved>";
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
      {
        wrappedChatKey,
        pub: TestData.mary.publicMainKey,
        priv: TestData.mary.privateMainKey!,
      },
    );

    expect(message).toBe("Failed to load document chats-broken");
  });

  test("receiveContactRequest rejects when the chats document isn't actually a chatList", async ({
    page,
  }) => {
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const chatsKey = await generateAesGcmKeyJwk();
    const settingsKey = await generateAesGcmKeyJwk();
    const chatKey = await generateAesGcmKeyJwk();
    const wrappedChatKey = await encryptKeyEnvelopeEcdh(
      chatKey,
      TestData.mary.privateMainKey!,
      TestData.mary.publicMainKey,
    );
    const content = await aesGcmEncrypt(
      chatsKey,
      new TextEncoder().encode(
        JSON.stringify({ type: "folder", name: "Not Chats", documents: [] }),
      ),
    );
    const wrappedChatsKey = await encryptKeyEnvelope(chatsKey, settingsKey);
    await page.route(`**/users/${userId}/documents/chats-wrong-type`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: content,
      }),
    );
    await page.route(
      `**/users/${userId}/documents/chats-wrong-type/keys/${userId}`,
      (route) =>
        route.fulfill({ status: 200, json: { sharedKey: wrappedChatsKey } }),
    );
    await page.goto("/");

    const message = await page.evaluate(
      async ({ userId, settingsKey, wrappedChatKey, pub, priv }) => {
        try {
          await window.contactService.receiveContactRequest(
            userId,
            {
              inviter: userId,
              invitee: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
              publicKey: pub as JsonWebKey,
              status: "ACCEPTED",
              chatId: "chat-1",
              sharedKey: wrappedChatKey,
            },
            { documentId: "pp", key: pub as JsonWebKey },
            {
              documents: "docs",
              chats: "chats-wrong-type",
              profile: "profile",
              settingsKey: settingsKey as JsonWebKey,
            },
            { publicKey: pub as JsonWebKey, privateKey: priv as JsonWebKey },
          );
          return "<resolved>";
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
      {
        userId,
        settingsKey,
        wrappedChatKey,
        pub: TestData.mary.publicMainKey,
        priv: TestData.mary.privateMainKey!,
      },
    );

    expect(message).toBe(
      'Expected the "chats" document to be a chatList, got folder',
    );
  });

  test("loadChatKey rejects when the chat document isn't actually a chat", async ({
    page,
  }) => {
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const chatsDocumentKey = await generateAesGcmKeyJwk();
    const wrongKey = await generateAesGcmKeyJwk();
    const content = await aesGcmEncrypt(
      wrongKey,
      new TextEncoder().encode(
        JSON.stringify({ type: "folder", name: "Not A Chat", documents: [] }),
      ),
    );
    const wrappedKey = await encryptKeyEnvelope(wrongKey, chatsDocumentKey);
    await page.route(`**/users/${userId}/documents/not-a-chat`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: content,
      }),
    );
    await page.route(
      `**/users/${userId}/documents/not-a-chat/keys/${userId}`,
      (route) =>
        route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ userId, chatsDocumentKey }) =>
        window.contactService.loadChatKey(
          userId,
          { userId, chatId: "not-a-chat", owner: userId },
          userId,
          chatsDocumentKey as JsonWebKey,
        ),
      { userId, chatsDocumentKey },
    );

    expect(message).toBe("Expected a chat document, got folder");
  });

  test("loadChatKey rejects when a contact's chat document can't be loaded and nothing is pending", async ({
    page,
  }) => {
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const owner = "10ad1cce-816b-4e12-b94d-7ef824c0d162";
    await page.route(`**/users/${owner}/documents/not-created`, (route) =>
      route.fulfill({ status: 403 }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ userId, owner }) =>
        window.contactService.loadChatKey(
          userId,
          {
            userId: owner,
            chatId: "not-created",
            owner,
            name: owner,
            profileRevision: "",
          },
          "chats",
          {} as JsonWebKey,
        ),
      { userId, owner },
    );

    expect(message).toBe("Failed to load document not-created");
  });

  test("loadChatKey falls back to the pending chat key while the inviter has not created the chat", async ({
    page,
  }) => {
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const owner = "10ad1cce-816b-4e12-b94d-7ef824c0d162";
    const chatKey = await generateAesGcmKeyJwk();
    await page.route(`**/users/${owner}/documents/not-created-yet`, (route) =>
      route.fulfill({ status: 403 }),
    );
    await page.goto("/");

    const result = await page.evaluate(
      ({ userId, owner, chatKey }) =>
        window.contactService.loadChatKey(
          userId,
          {
            userId: owner,
            chatId: "not-created-yet",
            owner,
            name: owner,
            profileRevision: "",
            pending: {
              chatKey: chatKey as JsonWebKey,
              publicProfiles: { [owner]: "alices-public-profile" },
            },
          },
          "chats",
          {} as JsonWebKey,
        ),
      { userId, owner, chatKey },
    );

    expect(result.pending).toBe(true);
    expect(result.key).toEqual(chatKey);
    expect(result.publicProfiles).toEqual({
      [owner]: "alices-public-profile",
    });
  });

  test("loadChatKey does not mask a server error with the pending chat key", async ({
    page,
  }) => {
    // Only "not there / not allowed yet" (401/403/404) means the inviter has
    // not created the chat - a 500 must surface as an error.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const owner = "10ad1cce-816b-4e12-b94d-7ef824c0d162";
    const chatKey = await generateAesGcmKeyJwk();
    await page.route(`**/users/${owner}/documents/chat-broken`, (route) =>
      route.fulfill({ status: 500 }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ userId, owner, chatKey }) =>
        window.contactService.loadChatKey(
          userId,
          {
            userId: owner,
            chatId: "chat-broken",
            owner,
            name: owner,
            profileRevision: "",
            pending: { chatKey: chatKey as JsonWebKey, publicProfiles: {} },
          },
          "chats",
          {} as JsonWebKey,
        ),
      { userId, owner, chatKey },
    );

    expect(message).toBe("Failed to load document chat-broken");
  });

  test("updateContactProfileSnapshot keeps the pending chat key, dropPendingChatKey removes only it", async ({
    page,
  }) => {
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const chatsDocumentId = "chats-pending";
    const chatsKey = await generateAesGcmKeyJwk();
    const alice = {
      userId: "alice",
      chatId: "chat-alice",
      owner: "alice",
      name: "alice",
      profileRevision: "pp-rev-1",
      pending: { chatKey: chatsKey, publicProfiles: {} },
    };
    await page.route(`**/users/${user}/documents/${chatsDocumentId}`, (route) =>
      route.fulfill({ status: 204, headers: { ETag: '"v2"' } }),
    );
    await page.goto("/");

    const [snapshot, dropped] = await page.evaluate(
      async ({ user, chatsDocumentId, chatsKey, alice }) => {
        const chatsDocument = {
          documentId: chatsDocumentId,
          name: "chats",
          key: chatsKey as JsonWebKey,
          revision: '"v1"',
          contacts: [alice],
        };
        return [
          await window.contactService.updateContactProfileSnapshot(
            user,
            chatsDocument,
            alice.userId,
            { name: "Alice A.", revision: "pp-rev-2" },
          ),
          await window.contactService.dropPendingChatKey(
            user,
            chatsDocument,
            alice.userId,
          ),
        ];
      },
      { user, chatsDocumentId, chatsKey, alice },
    );

    expect(snapshot.contacts[0].pending).toBeDefined();
    expect(snapshot.contacts[0].name).toBe("Alice A.");
    expect(dropped.contacts[0].pending).toBeUndefined();
    expect(dropped.contacts[0]).toEqual({
      userId: "alice",
      chatId: "chat-alice",
      owner: "alice",
      name: "alice",
      profileRevision: "pp-rev-1",
    });
    expect(dropped.revision).toBe('"v2"');
  });

  test("updateContactProfileSnapshot re-reads the chats document and retries when the write hits a concurrent-change 412", async ({
    page,
  }) => {
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const chatsDocumentId = "chats-retry";
    const chatsKey = await generateAesGcmKeyJwk();
    const alice = {
      userId: "alice",
      chatId: "chat-alice",
      owner: user,
      name: "alice",
      profileRevision: "",
    };
    // A contact added to the "chats" document by another write since the
    // client loaded it - the retry's re-read must pick this sibling up
    // alongside alice's own refreshed snapshot.
    const concurrentlyAddedSibling = {
      userId: "bob",
      chatId: "chat-bob",
      owner: user,
      name: "bob",
      profileRevision: "",
    };
    const reloadedChats = await aesGcmEncrypt(
      chatsKey,
      new TextEncoder().encode(
        JSON.stringify({
          name: "chats",
          type: "chatList",
          contacts: [alice, concurrentlyAddedSibling],
        }),
      ),
    );

    let putAttempts = 0;
    await page.route(
      `**/users/${user}/documents/${chatsDocumentId}`,
      (route) => {
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/octet-stream",
            headers: { ETag: '"chats-v2"' },
            body: Buffer.from(reloadedChats),
          });
        }
        putAttempts += 1;
        return putAttempts === 1
          ? route.fulfill({ status: 412 })
          : route.fulfill({
              status: 204,
              headers: { ETag: '"chats-v3"' },
            });
      },
    );
    await page.goto("/");

    const result = await page.evaluate(
      async ({ user, chatsDocumentId, chatsKey, alice }) => {
        return window.contactService.updateContactProfileSnapshot(
          user,
          {
            documentId: chatsDocumentId,
            name: "chats",
            key: chatsKey as JsonWebKey,
            revision: '"chats-v1"',
            contacts: [alice],
          },
          alice.userId,
          { name: "Alice A.", avatarId: "avatar-1", revision: "pp-rev-2" },
        );
      },
      { user, chatsDocumentId, chatsKey, alice },
    );

    expect(putAttempts).toBe(2);
    // Bob (added concurrently) survived the retry, and alice's snapshot got
    // the refreshed name/revision rather than being dropped by the 412.
    expect(result.contacts).toHaveLength(2);
    const updatedAlice = result.contacts.find((c) => c.userId === "alice");
    expect(updatedAlice?.name).toBe("Alice A.");
    expect(updatedAlice?.profileRevision).toBe("pp-rev-2");
    expect(result.contacts.some((c) => c.userId === "bob")).toBe(true);
    expect(result.revision).toBe('"chats-v3"');
  });

  test("updateContactProfileSnapshot propagates a genuine (non-412) write failure without retrying", async ({
    page,
  }) => {
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const chatsDocumentId = "chats-fails";
    const chatsKey = await generateAesGcmKeyJwk();
    const alice = {
      userId: "alice",
      chatId: "chat-alice",
      owner: user,
      name: "alice",
      profileRevision: "",
    };

    let putAttempts = 0;
    await page.route(
      `**/users/${user}/documents/${chatsDocumentId}`,
      (route) => {
        putAttempts += 1;
        return route.fulfill({ status: 500 });
      },
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ user, chatsDocumentId, chatsKey, alice }) =>
        window.contactService.updateContactProfileSnapshot(
          user,
          {
            documentId: chatsDocumentId,
            name: "chats",
            key: chatsKey as JsonWebKey,
            revision: '"chats-v1"',
            contacts: [alice],
          },
          alice.userId,
          { name: "Alice A.", avatarId: "avatar-1", revision: "pp-rev-2" },
        ),
      { user, chatsDocumentId, chatsKey, alice },
    );

    expect(message).toBe("Http Error 500");
    expect(putAttempts).toBe(1);
  });
});

// -------------------------------------------------------------------------
// publicProfileService - the concurrent-creation race (§3.5's race note).
// -------------------------------------------------------------------------

test.describe("publicProfileService error/race paths", () => {
  test("ensurePublicProfile adopts a concurrently created public profile after a 412", async ({
    page,
  }) => {
    // Simulates two devices racing to create mary's public-profile at once:
    // our own create attempt is rejected with 412 (another device's write won
    // the ETag check first), so we reload the private profile, see the
    // publicProfileId the winner already set, and adopt their public profile
    // instead of retrying our own.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const profileId = TestData.mary.settings!.profile;
    const profileKey = TestData.mary.documents[5].key!;
    const winnerPublicProfileId = "66666666-6666-6666-6666-666666666666";

    // The 412 itself isn't asserted through Pact/ContractTest: the pact
    // interaction builder never captures the multipart request body (see
    // every other upload interaction in this suite, which only assert
    // Content-Type), so a real provider verification replay sends no
    // folderETag and can't naturally 412 - mocked directly via page.route
    // below instead (imagey-web-error-path-tests memory).
    const reloadedProfileContent = await aesGcmEncrypt(
      profileKey,
      new TextEncoder().encode(
        JSON.stringify({
          emails: ["mary@imagey.cloud"],
          publicProfileId: winnerPublicProfileId,
        }),
      ),
    );
    provider
      .addInteraction()
      .uponReceiving(
        "a request of mary to reload her profile after losing the public-profile creation race",
      )
      .withRequest("GET", `/users/${userId}/documents/${profileId}`, (r) =>
        r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(200, (r) =>
        r.body("application/octet-stream", reloadedProfileContent),
      );

    const winnerKey = await generateAesGcmKeyJwk();
    const winnerContent = await aesGcmEncrypt(
      winnerKey,
      new TextEncoder().encode(
        JSON.stringify({ type: "publicProfile", name: "Mary Doe" }),
      ),
    );
    provider
      .addInteraction()
      // Unlike mary's other named-public-profile fixtures, this document has
      // no fixed id and so no matching static fixture in imagey-server - the
      // "a document exists" provider state (see ContractTest.
      // aDocumentExists) creates it on demand for ContractTest.
      .given("a document exists", {
        ownerId: userId,
        documentId: winnerPublicProfileId,
        kid: profileId,
        issuer: userId,
      })
      .uponReceiving("a request of mary to get the winning public profile")
      .withRequest(
        "GET",
        `/users/${userId}/documents/${winnerPublicProfileId}`,
        (r) => r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(200, (r) =>
        r.body("application/octet-stream", winnerContent),
      );
    const wrappedWinnerKey = await encryptKeyEnvelope(winnerKey, profileKey);
    const builder = provider
      .addInteraction()
      .given("a document exists", {
        ownerId: userId,
        documentId: winnerPublicProfileId,
        kid: profileId,
        issuer: userId,
      })
      .uponReceiving("a request of mary to get the winning public profile key")
      .withRequest(
        "GET",
        `/users/${userId}/documents/${winnerPublicProfileId}/keys/${profileId}`,
        (r) => r.headers({ Accept: "application/json" }),
      )
      .willRespondWith(200, (r) =>
        r.jsonBody({
          sharedKey: MatchersV3.string(wrappedWinnerKey),
        }),
      );

    await builder.executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      // Registered after setupMockServer's catch-all, so it wins for this
      // one path (Playwright matches routes last-registered-first) without
      // disturbing the Pact-mocked GETs below.
      await page.route(`**/users/${userId}/documents`, (route) =>
        route.fulfill({ status: 412 }),
      );
      await page.goto("/");

      const result = await page.evaluate(
        async ({ userId, profileId, profileKey }) =>
          window.publicProfileService.ensurePublicProfile(userId, profileId, {
            name: "",
            emails: [],
            key: profileKey,
          }),
        { userId, profileId, profileKey },
      );

      expect(result.publicProfile.name).toBe("Mary Doe");
      expect(result.profile.publicProfileId).toBe(winnerPublicProfileId);
      await expect.poll(() => runningPactRequests).toBe(0);
    });
  });

  test("ensurePublicProfile rethrows the original error when the concurrent winner hasn't linked a public profile yet", async ({
    page,
  }) => {
    // Same race as "adopts a concurrently created public profile after a
    // 412" above, but this time the winning device's write only got as far
    // as saving the private profile - it hasn't set publicProfileId yet
    // (e.g. it crashed, or is still mid-flight elsewhere). There's then
    // nothing to adopt: adoptConcurrentlyCreatedPublicProfile gives up and
    // rethrows the original 412 failure rather than creating a second,
    // orphaned public profile. The reloaded payload also omits `emails`,
    // exercising its `?? []` fallback.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const profileId = TestData.mary.settings!.profile;
    const profileKey = TestData.mary.documents[5].key!;

    const reloadedProfileContent = await aesGcmEncrypt(
      profileKey,
      new TextEncoder().encode(JSON.stringify({ name: "Mary Doe" })),
    );
    const builder = provider
      .addInteraction()
      .uponReceiving(
        "a request of mary to reload her profile after losing the public-profile creation race without a winner yet",
      )
      .withRequest("GET", `/users/${userId}/documents/${profileId}`, (r) =>
        r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(200, (r) =>
        r.body("application/octet-stream", reloadedProfileContent),
      );

    await builder.executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.route(`**/users/${userId}/documents`, (route) =>
        route.fulfill({ status: 412 }),
      );
      await page.goto("/");

      const message = await messageFromBrowser(
        page,
        async ({ userId, profileId, profileKey }) =>
          window.publicProfileService.ensurePublicProfile(userId, profileId, {
            name: "",
            emails: [],
            key: profileKey,
          }),
        { userId, profileId, profileKey },
      );

      expect(message).toBe("Folder changed during upload");
      await expect.poll(() => runningPactRequests).toBe(0);
    });
  });

  test("loadContactProfile falls back to undefined when the contact's public profile isn't reachable", async ({
    page,
  }) => {
    // §3.4's error case: the chat metadata names a public-profile that isn't
    // actually reachable yet (e.g. the sharing key hasn't been filed for us,
    // or the document is simply gone) - useContactProfile falls back to the
    // contact's raw userId/initial rather than the whole chat erroring out.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const contactUserId = "a358c2ed-07d4-4a25-a7db-d860d5c0b895";
    const publicProfileId = "77777777-7777-7777-7777-777777777777";
    const chatKey = await generateAesGcmKeyJwk();

    const builder = provider
      .addInteraction()
      .uponReceiving(
        "a request of mary to get a contact's unreachable public profile",
      )
      .withRequest(
        "GET",
        `/users/${contactUserId}/documents/${publicProfileId}`,
        (r) => r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(404);

    await builder.executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.goto("/");

      const result = await page.evaluate(
        async ({ userId, contactUserId, publicProfileId, chatKey }) =>
          window.publicProfileService.loadContactProfile(
            userId,
            contactUserId,
            publicProfileId,
            chatKey,
          ),
        { userId, contactUserId, publicProfileId, chatKey },
      );

      expect(result).toBeUndefined();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
  });

  test("ensurePublicProfile propagates a genuine (non-412) creation failure", async ({
    page,
  }) => {
    // Only a 412 (lost the concurrent-creation race, see the "adopts" test
    // above) is treated specially - any other failure creating the public
    // profile must still surface as a rejection, not be swallowed. An
    // arbitrary 500 isn't a real provider behavior to verify a contract
    // against (see the imagey-web-error-path-tests memory), so this is
    // mocked directly via page.route rather than through Pact/ContractTest.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const profileId = TestData.mary.settings!.profile;
    const profileKey = TestData.mary.documents[5].key!;

    await page.goto("/");
    await page.route(`**/users/${userId}/documents`, (route) =>
      route.fulfill({ status: 500 }),
    );

    const message = await messageFromBrowser(
      page,
      async ({ userId, profileId, profileKey }) =>
        window.publicProfileService.ensurePublicProfile(userId, profileId, {
          name: "",
          emails: [],
          key: profileKey,
        }),
      { userId, profileId, profileKey },
    );

    expect(message).toBe("Http Error 500");
  });

  test("loadProfileAndEnsurePublicProfile rejects when the profile document isn't actually a profile", async ({
    page,
  }) => {
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const profileKey = await generateAesGcmKeyJwk();
    const settingsKey = await generateAesGcmKeyJwk();
    const content = await aesGcmEncrypt(
      profileKey,
      new TextEncoder().encode(
        JSON.stringify({
          type: "folder",
          name: "Not A Profile",
          documents: [],
        }),
      ),
    );
    const wrappedKey = await encryptKeyEnvelope(profileKey, settingsKey);
    await page.route(
      `**/users/${userId}/documents/profile-wrong-type`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: content,
        }),
    );
    await page.route(
      `**/users/${userId}/documents/profile-wrong-type/keys/${userId}`,
      (route) =>
        route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ userId, settingsKey }) =>
        window.publicProfileService.loadProfileAndEnsurePublicProfile(userId, {
          profile: "profile-wrong-type",
          settingsKey: settingsKey as JsonWebKey,
        }),
      { userId, settingsKey },
    );

    expect(message).toBe(
      "Expected the profile document to be a profile, got folder",
    );
  });

  test("ensurePublicProfile rejects when the linked public profile can no longer be loaded", async ({
    page,
  }) => {
    // profile.publicProfileId is set but the document it points at is gone
    // (or not reachable) - ensurePublicProfile must reject rather than
    // silently create a second, orphaned public profile.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const profileId = TestData.mary.settings!.profile;
    const profileKey = TestData.mary.documents[5].key!;
    const missingPublicProfileId = "88888888-8888-8888-8888-888888888888";

    const builder = provider
      .addInteraction()
      .uponReceiving(
        "a request of mary to get her linked-but-missing public profile",
      )
      .withRequest(
        "GET",
        `/users/${userId}/documents/${missingPublicProfileId}`,
        (r) => r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(404);

    await builder.executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.goto("/");

      const message = await messageFromBrowser(
        page,
        async ({ userId, profileId, profileKey, missingPublicProfileId }) =>
          window.publicProfileService.ensurePublicProfile(userId, profileId, {
            name: "",
            emails: [],
            key: profileKey,
            publicProfileId: missingPublicProfileId,
          }),
        { userId, profileId, profileKey, missingPublicProfileId },
      );

      expect(message).toBe(
        "Failed to load existing public profile " + missingPublicProfileId,
      );
      await expect.poll(() => runningPactRequests).toBe(0);
    });
  });

  test("loadContactProfile falls back to undefined when the contact's public profile document has an unexpected type", async ({
    page,
  }) => {
    // Distinct from "isn't reachable" above (a 404, caught by the outer
    // try/catch): here the document loads and decrypts just fine, but isn't
    // actually a publicProfile - e.g. the chat metadata's publicProfileId
    // got corrupted or points at the wrong document. loadContactProfile's
    // own type check (not its catch block) is what returns undefined here.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const contactUserId = "a358c2ed-07d4-4a25-a7db-d860d5c0b895";
    const publicProfileId = "77777777-7777-7777-7777-777777777776";
    const chatKey = await generateAesGcmKeyJwk();
    const documentKey = await generateAesGcmKeyJwk();

    const content = await aesGcmEncrypt(
      documentKey,
      new TextEncoder().encode(
        JSON.stringify({
          type: "folder",
          name: "Not A Public Profile",
          documents: [],
        }),
      ),
    );
    const wrappedKey = await encryptKeyEnvelope(documentKey, chatKey);

    await page.route(
      `**/users/${contactUserId}/documents/${publicProfileId}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: content,
        }),
    );
    await page.route(
      `**/users/${contactUserId}/documents/${publicProfileId}/keys/${userId}`,
      (route) =>
        route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
    );
    await page.goto("/");

    const result = await page.evaluate(
      async ({ userId, contactUserId, publicProfileId, chatKey }) =>
        window.publicProfileService.loadContactProfile(
          userId,
          contactUserId,
          publicProfileId,
          chatKey,
        ),
      { userId, contactUserId, publicProfileId, chatKey },
    );

    expect(result).toBeUndefined();
  });

  test("ensurePublicProfile rejects when the linked public profile document has an unexpected type", async ({
    page,
  }) => {
    // Distinct from "...can no longer be loaded" above (a 404): here the
    // linked document loads and decrypts fine but isn't a publicProfile -
    // loadOwnPublicProfile's type check (not its catch block) is what
    // returns undefined here, which ensurePublicProfile then rejects on.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const profileId = TestData.mary.settings!.profile;
    const profileKey = TestData.mary.documents[5].key!;
    const existingPublicProfileId = "88888888-8888-8888-8888-888888888889";
    const documentKey = await generateAesGcmKeyJwk();

    const content = await aesGcmEncrypt(
      documentKey,
      new TextEncoder().encode(
        JSON.stringify({
          type: "folder",
          name: "Not A Public Profile",
          documents: [],
        }),
      ),
    );
    const wrappedKey = await encryptKeyEnvelope(documentKey, profileKey);

    await page.route(
      `**/users/${userId}/documents/${existingPublicProfileId}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: content,
        }),
    );
    await page.route(
      `**/users/${userId}/documents/${existingPublicProfileId}/keys/${profileId}`,
      (route) =>
        route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      async ({ userId, profileId, profileKey, existingPublicProfileId }) =>
        window.publicProfileService.ensurePublicProfile(userId, profileId, {
          name: "",
          emails: [],
          key: profileKey,
          publicProfileId: existingPublicProfileId,
        }),
      { userId, profileId, profileKey, existingPublicProfileId },
    );

    expect(message).toBe(
      "Failed to load existing public profile " + existingPublicProfileId,
    );
  });

  test("setName falls back to the previous revision when the update response carries no ETag", async ({
    page,
  }) => {
    // documentService.updateDocumentMetadata resolves to null when the
    // server's response carries no ETag header - setName then keeps the
    // publicProfile's previous revision rather than overwriting it with
    // null (which would send no If-Match on the next save).
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const documentId = "public-profile-no-etag";
    const key = await generateAesGcmKeyJwk();

    await page.route(`**/users/${userId}/documents/${documentId}`, (route) =>
      route.fulfill({ status: 200 }),
    );
    await page.goto("/");

    const result = await page.evaluate(
      async ({ userId, documentId, key }) =>
        window.publicProfileService.setName(
          userId,
          {
            documentId,
            name: "Old Name",
            owner: userId,
            revision: '"old-revision"',
            key: key as JsonWebKey,
            type: "publicProfile",
          },
          "New Name",
        ),
      { userId, documentId, key },
    );

    expect(result.revision).toBe('"old-revision"');
  });

  test("setAvatar falls back to the previous revision when the update response carries no ETag", async ({
    page,
  }) => {
    // Same fallback as setName above, exercised on setAvatar's own
    // `newRevision ?? publicProfile.revision`.
    const userId = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const documentId = "public-profile-no-etag-avatar";
    const key = await generateAesGcmKeyJwk();

    await page.route(
      `**/users/${userId}/documents/${documentId}/files/*`,
      (route) => route.fulfill({ status: 200 }),
    );
    await page.route(`**/users/${userId}/documents/${documentId}`, (route) =>
      route.fulfill({ status: 200 }),
    );
    await page.goto("/");

    const result = await page.evaluate(
      async ({ userId, documentId, key }) => {
        // A minimal 1x1 transparent PNG - just needs to be decodable;
        // renderAvatar re-encodes it to the fixed avatar size regardless of
        // the source's own dimensions.
        const base64Png =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        const bytes = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0));
        const picture = new File([bytes], "avatar.png", { type: "image/png" });
        return window.publicProfileService.setAvatar(
          userId,
          {
            documentId,
            name: "Mary",
            owner: userId,
            revision: '"old-revision"',
            key: key as JsonWebKey,
            type: "publicProfile",
          },
          picture,
        );
      },
      { userId, documentId, key },
    );

    expect(result.revision).toBe('"old-revision"');
  });
});

// -------------------------------------------------------------------------
// DocumentService - guard clauses and the folder-key fallback in
// loadContent / getSettings / shareDocument.
// -------------------------------------------------------------------------

test.describe("DocumentService error paths", () => {
  test("shareDocument rejects a document that carries no key", async ({
    page,
  }) => {
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.documentService.shareDocument(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        { documentId: "doc-1" } as { documentId: string; key: JsonWebKey },
        "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
        {} as JsonWebKey,
      ),
    );

    expect(message).toBe("Document key not found");
  });

  test("shareDocument tolerates a 409 - the document is already shared into this chat", async ({
    page,
  }) => {
    await page.goto("/");

    // Key slots are write-once server-side; a 409 means laura's entry is
    // already filed, which is the desired state, so shareDocument resolves.
    await page.route(`**/users/${MARY}/documents/doc-1/keys`, (route) =>
      route.fulfill({ status: 409 }),
    );

    const documentKey = await generateAesGcmKeyJwk();
    const chatKey = await generateAesGcmKeyJwk();

    const result = await messageFromBrowser(
      page,
      (arg: { documentKey: JsonWebKey; chatKey: JsonWebKey }) =>
        window.documentService.shareDocument(
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
          { documentId: "doc-1", name: "doc-1", key: arg.documentKey },
          "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
          arg.chatKey,
        ),
      { documentKey, chatKey },
    );

    expect(result).toBe("<resolved>");
  });

  test("loadContent rejects when neither a content id nor a preview image is available", async ({
    page,
  }) => {
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.documentService.loadContent({
        documentId: "doc-1",
        name: "doc-1",
        owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
        type: "file",
        mimeType: "text/plain",
        size: 0,
        contentId: "",
        key: { kty: "oct", k: "irrelevant" } as JsonWebKey,
      }),
    );

    expect(message).toBe(
      "Document has no preview image and no contentId given",
    );
  });

  test("getSettings rejects when the settings document is missing its ids", async ({
    page,
  }) => {
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    // A valid (self-ECDH-wrapped) settings key, so decryptKey() succeeds and
    // we get all the way to the "missing required ids" guard...
    const settingsKey = await generateAesGcmKeyJwk();
    const wrappedSettingsKey = await encryptKeyEnvelopeEcdh(
      settingsKey,
      TestData.mary.privateMainKey!,
      TestData.mary.publicMainKey,
    );

    await page.route(`**/users/${user}/documents/${user}`, (route) =>
      // ...but an empty settings document body, so no ids can be read.
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: "",
      }),
    );
    await page.route(`**/users/${user}/documents/${user}/keys/0`, (route) =>
      route.fulfill({
        status: 200,
        json: { issuer: user, kid: "0", sharedKey: wrappedSettingsKey },
      }),
    );
    await page.goto("/");

    const message = await page.evaluate(
      async ({ user, pub, priv }) => {
        try {
          await window.documentService.getSettings(
            user,
            pub as JsonWebKey,
            priv as JsonWebKey,
          );
          return "<resolved>";
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
      {
        user,
        pub: TestData.mary.publicMainKey,
        priv: TestData.mary.privateMainKey!,
      },
    );

    expect(message).toBe("Settings document is missing required IDs");
  });

  test("storeDocument re-reads the folder and retries when the upload hits a concurrent-change 412", async ({
    page,
  }) => {
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const folderId = "retry-folder";
    const siblingId = "sibling-added-meanwhile";
    // A real FolderEntry, as a folder listing actually stores its children -
    // not a bare id - so the retry-merge path is exercised the way it would
    // be reached by FolderEntryImageComponent's thumbnail lookup.
    const siblingEntry = {
      documentId: siblingId,
      name: "sibling.jpg",
      type: "image",
      mimeType: "image/jpeg",
      mediumImageId: "sibling-medium",
      sharedKey: { sharedKey: "sibling-wrapped-key" },
    };

    const folderKey = await generateAesGcmKeyJwk();
    // The folder as the server has it *after* a sibling was added since the
    // client loaded it - the retry's re-read must pick this sibling up.
    const reloadedFolder = await aesGcmEncrypt(
      folderKey,
      new TextEncoder().encode(
        JSON.stringify({
          documentId: folderId,
          name: "Vacation",
          type: "folder",
          documents: [siblingEntry],
        }),
      ),
    );

    let uploadAttempts = 0;
    await page.route(`**/users/${user}/documents`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      uploadAttempts += 1;
      return uploadAttempts === 1
        ? route.fulfill({ status: 412 })
        : route.fulfill({
            status: 201,
            headers: {
              Location: `/users/${user}/documents/new-doc`,
              ETag: '"folder-v3"',
            },
          });
    });
    await page.route(`**/users/${user}/documents/${folderId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        headers: { ETag: '"folder-v2"' },
        body: Buffer.from(reloadedFolder),
      }),
    );
    await page.goto("/");

    const result = await page.evaluate(
      async ({ user, folderId, folderKey }) => {
        const r = await window.documentService.storeDocument(
          user,
          new File([], "note.txt", { type: "text/plain" }),
          {
            documentId: folderId,
            name: "Vacation",
            type: "folder",
            documents: [],
            revision: '"folder-v1"',
          },
          folderKey as JsonWebKey,
        );
        return {
          documents: r.parentFolderDocuments,
          etag: r.parentFolderRevision,
        };
      },
      { user, folderId, folderKey },
    );

    expect(uploadAttempts).toBe(2);
    // The concurrently-added sibling survived - full FolderEntry intact,
    // sharedKey/type included - and the new document sits after it.
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].documentId).toBe(siblingId);
    expect(result.documents[0].sharedKey).toEqual(siblingEntry.sharedKey);
    expect(result.documents[0].type).toBe(siblingEntry.type);
    expect(result.documents[1].documentId).not.toBe(siblingId);
    expect(result.etag).toBe('"folder-v3"');
  });

  test("storeDocument's concurrent-change retry carries the Access-Path header through to the reload", async ({
    page,
  }) => {
    // A folder reached only transitively through a contact's shared tree
    // (ADR 0009) - the initial upload AND the 412 retry's reload must both
    // carry the same Access-Path header, or the reload is rejected by the
    // server's verifyAccess and the retry throws instead of recovering.
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const folderOwner = "bob-owns-this-shared-folder";
    const folderId = "retry-folder-shared";
    const accessPath = "eyJjaGFpbiI6W119"; // opaque - only its propagation is under test

    const folderKey = await generateAesGcmKeyJwk();
    const reloadedFolder = await aesGcmEncrypt(
      folderKey,
      new TextEncoder().encode(
        JSON.stringify({
          documentId: folderId,
          name: "Vacation",
          type: "Folder",
          documents: [],
        }),
      ),
    );

    let uploadAttempts = 0;
    let uploadAccessPath: string | undefined;
    let reloadAccessPath: string | undefined;
    await page.route(`**/users/${user}/documents`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      uploadAttempts += 1;
      uploadAccessPath = route.request().headers()["access-path"];
      return uploadAttempts === 1
        ? route.fulfill({ status: 412 })
        : route.fulfill({
            status: 201,
            headers: {
              Location: `/users/${user}/documents/new-doc`,
              ETag: '"folder-v2"',
            },
          });
    });
    await page.route(
      `**/users/${folderOwner}/documents/${folderId}`,
      (route) => {
        reloadAccessPath = route.request().headers()["access-path"];
        return route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          headers: { ETag: '"folder-v1"' },
          body: Buffer.from(reloadedFolder),
        });
      },
    );
    await page.goto("/");

    await page.evaluate(
      async ({ user, folderOwner, folderId, folderKey, accessPath }) => {
        await window.documentService.storeDocument(
          user,
          new File([], "note.txt", { type: "text/plain" }),
          {
            documentId: folderId,
            name: "Vacation",
            type: "folder",
            documents: [],
            owner: folderOwner,
            revision: '"folder-v0"',
          },
          folderKey as JsonWebKey,
          accessPath,
        );
      },
      { user, folderOwner, folderId, folderKey, accessPath },
    );

    expect(uploadAttempts).toBe(2);
    expect(uploadAccessPath).toBe(accessPath);
    expect(reloadAccessPath).toBe(accessPath);
  });

  test("storeDocument rejects a successful upload response that carries no Location header", async ({
    page,
  }) => {
    // A malformed 201 a real provider would never intentionally send - the
    // document id is only known from Location, so there is nothing sensible
    // to return.
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const folderId = "folder-without-location";
    const folderKey = await generateAesGcmKeyJwk();

    await page.route(`**/users/${user}/documents`, (route) =>
      route.fulfill({ status: 201, headers: { ETag: '"folder-v1"' } }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ user, folderId, folderKey }) =>
        window.documentService.storeDocument(
          user,
          new File([], "note.txt", { type: "text/plain" }),
          {
            documentId: folderId,
            name: "Vacation",
            type: "folder",
            documents: [],
            revision: '"folder-v0"',
          },
          folderKey as JsonWebKey,
        ),
      { user, folderId, folderKey },
    );

    expect(message).toBe("No location header");
  });

  test("updateDocumentMetadata rejects with a precondition error when the document changed since load", async ({
    page,
  }) => {
    const user = "d20cf443-4f96-418f-a957-c8cbef8677c3";
    const documentId = "doc-under-edit";
    const documentKey = await generateAesGcmKeyJwk();

    let sentIfMatch: string | undefined;
    await page.route(`**/users/${user}/documents/${documentId}`, (route) => {
      sentIfMatch = route.request().headers()["if-match"];
      return route.fulfill({ status: 412 });
    });
    await page.goto("/");

    const message = await messageFromBrowser(
      page,
      ({ user, documentId, documentKey }) =>
        window.documentService.updateDocumentMetadata(
          user,
          documentId,
          documentKey as JsonWebKey,
          { name: "renamed" },
          '"doc-v1"',
        ),
      { user, documentId, documentKey },
    );

    expect(message).toContain("changed");
    expect(sentIfMatch).toBe('"doc-v1"');
  });
});

// -------------------------------------------------------------------------
// Authentication flow - the mail/challenge endpoints fail. Getting the app
// into the "email known, this device not authenticated" state just needs
// the public-key lookup to answer 401.
// -------------------------------------------------------------------------

test.describe("Authentication flow error paths", () => {
  test("shows a mail-server-unavailable message when starting auth returns 503", async ({
    page,
  }) => {
    const email = "newcomer@imagey.cloud";
    await page.route(`**/users/verifications`, (route) =>
      route.fulfill({ status: 503 }),
    );

    await page.goto(`/?email=${email}`);

    await expect(
      page.getByText("Mail server is currently unavailable"),
    ).toBeVisible();
  });

  test("shows a generic error when starting auth fails with 500", async ({
    page,
  }) => {
    const email = "newcomer@imagey.cloud";
    await page.route(`**/users/verifications`, (route) =>
      route.fulfill({ status: 500 }),
    );

    await page.goto(`/?email=${email}`);

    await expect(
      page.getByText("An error occurred during authentication"),
    ).toBeVisible();
  });

  test("challenge login surfaces an error when the challenge request fails", async ({
    page,
  }) => {
    await setupMarysDevice(page);
    const deviceId = TestData.mary.devices[0].deviceId;

    // 401 -> AuthenticationComponent renders the ChallengeAuthenticationDialog
    // (device id is known locally).
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (route) => route.fulfill({ status: 401 }),
    );
    await page.route(
      `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${deviceId}/challenges`,
      (route) => route.fulfill({ status: 500 }),
    );

    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );

    const passwordInput = page.getByLabel("Password", { exact: true });
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill(TestData.mary.password);
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect(page.getByText("Wrong password")).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Error handlers that live inside mounted components (.catch / img.onerror)
// rather than in a service - these need the real UI, reached after a
// page.route-mocked login.
// -------------------------------------------------------------------------

test.describe("Component error handlers", () => {
  test("image scaling rejects when the picked file isn't a decodable image", async ({
    page,
  }) => {
    await page.goto("/");

    // A file that claims to be a PNG but isn't - imageService.scale() loads
    // it into an <img>, whose `onerror` rejects the load.
    const message = await messageFromBrowser(page, () =>
      window.documentService.storeDocument(
        "d20cf443-4f96-418f-a957-c8cbef8677c3",
        new File([new Uint8Array([0, 1, 2, 3, 4])], "not-really.png", {
          type: "image/png",
        }),
        { documentId: "root-folder", name: "root-folder", documents: [] },
        { kty: "oct", k: "irrelevant" } as JsonWebKey,
      ),
    );

    expect(message).not.toBe("<resolved>");
  });

  test("registration shows an error when the server rejects the new user", async ({
    page,
  }) => {
    const email = "newcomer@imagey.cloud";
    const newcomerId = "00000000-0000-4000-8000-000000000001";
    // 404 on the public key -> AuthenticationComponent renders the
    // RegistrationDialog. Reaching it needs the resolved userId the server
    // would have put on the redirect.
    await page.route(`**/users/${newcomerId}/public-keys/0`, (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.route("**/users", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500 })
        : route.fallback(),
    );

    await page.goto(`/?email=${email}&userId=${newcomerId}`);

    const passwordInput = page.getByLabel("Password", { exact: true });
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("a-long-enough-password");
    await page.getByLabel("Confirm Password").fill("a-long-enough-password");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect(
      page.getByText("An error occurred during authentication"),
    ).toBeVisible();
  });

  test("the home page logs an error when activities can't be loaded", async ({
    page,
  }) => {
    const chatsId = TestData.mary.settings!.chats;
    // Attach the listener before the login navigation so it's in place by
    // the time Activities mounts and its getActivities() call fails.
    const consoleErrors = collectConsoleErrors(page);
    await loginMary(page, async (p) => {
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({ status: 500 }),
      );
      await p.route(`**/users/${MARY}/documents/${chatsId}`, (route) =>
        route.fulfill({ status: 500 }),
      );
    });

    await expect
      .poll(() =>
        consoleErrors.some((e) => e.includes("Failed to fetch activities")),
      )
      .toBe(true);
  });

  test("the chats page logs an error when an accepted request can't be received", async ({
    page,
  }) => {
    const chatsId = TestData.mary.settings!.chats;
    await loginMary(page, async (p) => {
      // An ACCEPTED request from Mary herself triggers the inviter-side
      // receive effect - but her "chats" document can't be loaded, so
      // contactService.receiveContactRequest() rejects.
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({
          status: 200,
          json: [
            {
              inviter: MARY,
              invitee: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
              publicKey: {},
              status: "ACCEPTED",
            },
          ],
        }),
      );
      await p.route(`**/users/${MARY}/documents/${chatsId}`, (route) =>
        route.fulfill({ status: 500 }),
      );
    });

    const consoleErrors = collectConsoleErrors(page);
    await page.getByRole("link", { name: "Chats" }).first().click();

    await expect
      .poll(() =>
        consoleErrors.some((e) =>
          e.includes("Failed to receive contact request"),
        ),
      )
      .toBe(true);
  });

  test("device activation shows an error when storing the key fails", async ({
    page,
  }) => {
    const thisDeviceId = TestData.mary.devices[0].deviceId;
    const otherDeviceId = TestData.mary.devices[1].deviceId;
    const profileId = TestData.mary.settings!.profile;

    await loginMary(page, async (p) => {
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({ status: 200, json: [] }),
      );
      // ProfilePage (the desktop Settings landing page) - let its document
      // load fail; loadDocument() swallows it and renders an empty profile.
      await p.route(`**/users/${MARY}/documents/${profileId}`, (route) =>
        route.fulfill({ status: 500 }),
      );
      await p.route(`**/users/${MARY}/devices`, (route) =>
        route.fulfill({
          status: 200,
          json: [thisDeviceId, otherDeviceId],
        }),
      );
      await p.route(
        `**/users/${MARY}/devices/${otherDeviceId}/public-keys/0`,
        (route) =>
          route.fulfill({
            status: 200,
            json: TestData.mary.devices[1].publicDeviceKey,
          }),
      );
      await p.route(
        `**/users/${MARY}/devices/${otherDeviceId}/private-keys/`,
        (route) =>
          route.request().method() === "POST"
            ? route.fulfill({ status: 500 })
            : route.fallback(),
      );
    });

    await page.getByRole("link", { name: "Settings" }).first().click();
    await page.getByRole("heading", { name: "Devices" }).click();

    const deviceEntry = page
      .locator("li", { hasText: otherDeviceId })
      .locator("div.max");
    await deviceEntry.click({ force: true });
    await expect(
      page.getByText(/Do you want to activate the device with id/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Error activating device")).toBeVisible();
  });

  test("profile page shows a retry message, not a broken form, when the profile fails to load", async ({
    page,
  }) => {
    const profileId = TestData.mary.settings!.profile;

    await loginMary(page, async (p) => {
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({ status: 200, json: [] }),
      );
      // Let the profile document load fail; loadDocument() rejects, and
      // ProfilePage shows a retry message instead of a Save button for a
      // profile it never actually has (nothing to no-op on anymore).
      await p.route(`**/users/${MARY}/documents/${profileId}`, (route) =>
        route.fulfill({ status: 500 }),
      );
    });

    await page.getByRole("link", { name: "Settings" }).first().click();
    await page
      .getByRole("heading", { name: "Profile", exact: true })
      .first()
      .click();

    await expect(
      page.getByText("Could not load your profile. Retrying..."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
  });

  test("profile page shows a retry message when the profile document isn't actually a profile", async ({
    page,
  }) => {
    const profileId = TestData.mary.settings!.profile;
    const profileKey = await generateAesGcmKeyJwk();
    const content = await aesGcmEncrypt(
      profileKey,
      new TextEncoder().encode(
        JSON.stringify({
          type: "folder",
          name: "Not A Profile",
          documents: [],
        }),
      ),
    );
    const wrappedKey = await encryptKeyEnvelope(
      profileKey,
      TestData.mary.settingsKey!,
    );

    await loginMary(page, async (p) => {
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({ status: 200, json: [] }),
      );
      await p.route(`**/users/${MARY}/documents/${profileId}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: content,
        }),
      );
      await p.route(
        `**/users/${MARY}/documents/${profileId}/keys/${MARY}`,
        (route) =>
          route.fulfill({ status: 200, json: { sharedKey: wrappedKey } }),
      );
    });

    await page.getByRole("link", { name: "Settings" }).first().click();
    await page
      .getByRole("heading", { name: "Profile", exact: true })
      .first()
      .click();

    await expect(
      page.getByText("Could not load your profile. Retrying..."),
    ).toBeVisible();
  });

  test("the folder page shows an error when the folder document can't be loaded", async ({
    page,
  }) => {
    const documentsId = TestData.mary.settings!.documents;

    await loginMary(page, async (p) => {
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({ status: 200, json: [] }),
      );
      // The root folder's key still resolves (real fixture)...
      await p.route(
        `**/users/${MARY}/documents/${documentsId}/keys/${MARY}`,
        (route) =>
          route.fulfill({
            status: 200,
            path: `tests/images/encrypted/${documentsId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json`,
          }),
      );
      // ...but the folder document itself fails to load.
      await p.route(`**/users/${MARY}/documents/${documentsId}`, (route) =>
        route.fulfill({ status: 500 }),
      );
    });

    await page.getByRole("link", { name: "Images" }).first().click();

    await expect(page.getByText("Could not load this folder.")).toBeVisible();
  });

  test("the folder page shows an error when the folder document isn't actually a folder", async ({
    page,
  }) => {
    const documentsId = TestData.mary.settings!.documents;
    const rootKey = TestData.mary.documents[0].key!;
    const content = await aesGcmEncrypt(
      rootKey,
      new TextEncoder().encode(
        JSON.stringify({ type: "profile", name: "Not A Folder", emails: [] }),
      ),
    );

    await loginMary(page, async (p) => {
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({ status: 200, json: [] }),
      );
      await p.route(
        `**/users/${MARY}/documents/${documentsId}/keys/${MARY}`,
        (route) =>
          route.fulfill({
            status: 200,
            path: `tests/images/encrypted/${documentsId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json`,
          }),
      );
      await p.route(`**/users/${MARY}/documents/${documentsId}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: content,
        }),
      );
    });

    await page.getByRole("link", { name: "Images" }).first().click();

    await expect(page.getByText("Could not load this folder.")).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Chat view - the chat Document's own key entry is unusable. Only how the
// /documents/{chatId}/keys/{chatsId} endpoint responds differs between the
// two cases, so that one route is left to the caller.
// -------------------------------------------------------------------------

async function prepareMarysBrokenChatAndOpenIt(
  page: Page,
  registerChatKeyRoute: (
    page: Page,
    chatId: string,
    chatsId: string,
  ) => Promise<void>,
) {
  await setupMarysDevice(page);

  const deviceId = TestData.mary.devices[0].deviceId;
  const documentsId = TestData.mary.settings!.documents;
  const chatsId = TestData.mary.settings!.chats;
  const chatId = "chat-laura";

  // A real "chats" document listing laura as a contact (mary invited laura,
  // so mary owns the chat - ADR 0015), encrypted for real
  // so the app gets past that step - only the chat Document's own key
  // entry (registered by the caller) is deliberately broken.
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const chatsContent = await aesGcmEncrypt(
    chatsDocumentKey,
    new TextEncoder().encode(
      JSON.stringify({
        name: "Chats",
        type: "chatList",
        contacts: [
          {
            userId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
            chatId,
            owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          },
        ],
      }),
    ),
  );
  const chatsWrappedKey = await encryptKeyEnvelope(
    chatsDocumentKey,
    TestData.mary.settingsKey!,
  );

  // documentService.loadDocument() decrypts the key before ever touching
  // the content, so this never needs to be valid ciphertext - it just
  // needs to be there.
  const chatContent = Buffer.from("irrelevant, never decrypted");

  await page.route(
    "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
    (route) =>
      route.fulfill({ status: 200, json: TestData.mary.publicMainKey }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${deviceId}/private-keys/0`,
    (route) =>
      route.fulfill({
        status: 200,
        json: {
          kid: "0",
          encryptingDeviceId: deviceId,
          key: TestData.mary.devices[0].encryptedPrivateMainKey,
        },
      }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${deviceId}/public-keys/0`,
    (route) =>
      route.fulfill({
        status: 200,
        json: TestData.mary.devices[0].publicDeviceKey,
      }),
  );
  await page.route(
    "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/d20cf443-4f96-418f-a957-c8cbef8677c3",
    (route) =>
      route.fulfill({
        status: 200,
        path: "tests/images/encrypted/d20cf443-4f96-418f-a957-c8cbef8677c3/document.enc",
      }),
  );
  await page.route(
    "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/d20cf443-4f96-418f-a957-c8cbef8677c3/keys/0",
    (route) =>
      route.fulfill({
        status: 200,
        path: "tests/images/encrypted/d20cf443-4f96-418f-a957-c8cbef8677c3/keys/0.json",
      }),
  );
  await page.route(
    "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
    (route) => route.fulfill({ status: 200, json: [] }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentsId}`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${documentsId}/document-empty-folder.enc`,
      }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentsId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${documentsId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json`,
      }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatsId}`,
    (route) =>
      route.fulfill({
        status: 200,
        body: chatsContent,
        contentType: "application/octet-stream",
      }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatsId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3`,
    (route) =>
      route.fulfill({
        status: 200,
        json: {
          issuer: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          kid: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          sharedKey: chatsWrappedKey,
        },
      }),
  );
  await page.route(
    `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatId}`,
    (route) =>
      route.fulfill({
        status: 200,
        body: chatContent,
        contentType: "application/octet-stream",
      }),
  );
  await registerChatKeyRoute(page, chatId, chatsId);
  // Deliberately no route for the messages endpoint: once the chat key
  // fails to decrypt, Chat.tsx must never try to fetch/decrypt messages
  // with it. If it does anyway, that request falls through unmocked and
  // fails, which is exactly the signal we want.

  await page.goto("/");
  await inputMarysPassword(page);

  await page.getByRole("link", { name: "Chats" }).first().click();
  // The contact entry carries neither a name nor an address - the list
  // falls back to a generic label, never to the opaque userId.
  const lauraContact = page.getByText("Unknown contact").first();
  await expect(lauraContact).toBeVisible();
  await expect(
    page.getByText("7f53a4ea-58b7-4bbf-b94d-f2038752d5b6"),
  ).toHaveCount(0);
  await lauraContact.click();
}

async function expectDecryptionErrorShown(page: Page) {
  // The chat view shows a plain decryption error instead of the message
  // list - no Re-Issue dialog/button (that belonged to the old symmetric
  // shared-key contact model and was removed with it).
  await expect(
    page.getByText(
      "There was an error decrypting the messages. This may be because the keys have changed.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Re-Issue" }),
  ).not.toBeVisible();
}

test("decryption error shows an error message when a chat key can't be decrypted", async ({
  page,
}) => {
  await prepareMarysBrokenChatAndOpenIt(page, async (page, chatId, chatsId) => {
    // The chat document's key entry exists but is garbage, so
    // cryptoService.decryptKey() throws and contactService.loadChatKey()
    // sees no usable document key.
    await page.route(
      `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatId}/keys/${chatsId}`,
      (route) =>
        route.fulfill({
          status: 200,
          json: {
            issuer: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            kid: chatsId,
            sharedKey: "AAAA",
          },
        }),
    );
  });

  await expectDecryptionErrorShown(page);
});

test("decryption error shows an error message when a chat key entry is missing", async ({
  page,
}) => {
  await prepareMarysBrokenChatAndOpenIt(page, async (page, chatId, chatsId) => {
    // No key entry at all for this chat document (e.g. it was never
    // shared with us, or got removed server-side) - documentRepository.
    // loadKey() rejects on the 404, which documentService.loadDocument()
    // swallows the same way it swallows a decrypt failure, so
    // contactService.loadChatKey() again sees no usable document key.
    await page.route(
      `**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatId}/keys/${chatsId}`,
      (route) => route.fulfill({ status: 404 }),
    );
  });

  await expectDecryptionErrorShown(page);
});
