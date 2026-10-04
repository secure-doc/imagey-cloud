import { Page } from "@playwright/test";
import { MatchersV2 as Matchers } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  setupMarysDevice,
  provider,
  setupMockServer,
  runningPactRequests,
  TestData,
  MARY_ID,
  loginAsMary,
  prepareMarysLogin,
  prepareMarysContactRequests,
  prepareMarysEmptyProfile,
  prepareMarysDocuments,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysChat,
  inputMarysPassword,
  LAURA_ID,
} from "./setup";
import { cryptoService } from "../../src/authentication/CryptoService";
import type { handlePush } from "../../src/notification/handlePush";
import type { notificationStore } from "../../src/notification/NotificationStore";
import type { createTranslator } from "../../src/notification/notificationTranslations";
import type { pushSubscriptionRepository } from "../../src/notification/PushSubscriptionRepository";
import type { pushSubscriptionService } from "../../src/notification/PushSubscriptionService";

declare global {
  interface Window {
    handlePush: typeof handlePush;
    notificationStore: typeof notificationStore;
    createTranslator: typeof createTranslator;
    pushSubscriptionRepository: typeof pushSubscriptionRepository;
    pushSubscriptionService: typeof pushSubscriptionService;
  }
}

// A syntactically valid (real base64url, right length) but otherwise made-up
// VAPID public key - urlBase64ToUint8Array only cares that it decodes.
const FAKE_VAPID_KEY = Buffer.from(new Uint8Array(65).fill(4)).toString(
  "base64url",
);
// Same idea for a subscription's p256dh/auth - PushSubscription.parse on the
// backend rejects anything that isn't valid base64url of the right byte
// length (65/16), so a plain placeholder string like "p256dh-key" would fail
// ContractTest's provider verification even though the Pact mock server
// itself doesn't care.
const FAKE_P256DH = Buffer.from(new Uint8Array(65).fill(5)).toString(
  "base64url",
);
const FAKE_AUTH = Buffer.from(new Uint8Array(16).fill(6)).toString("base64url");

// Fakes `navigator.serviceWorker.ready` (which never resolves under `vite
// dev` - there is no real service worker to register, see
// serviceWorkerRegistration.ts) with a fake registration whose pushManager
// never touches the network or a real push service, and replaces the real
// `Notification.permission`/`requestPermission` (headless Chromium always
// auto-denies a permission request with no prior user gesture, which would
// make every enable() path fail identically) with a controllable fake.
async function stubPushApis(
  page: Page,
  initialPermission: "default" | "denied" | "granted" = "default",
) {
  await page.addInitScript((initialPermission) => {
    let subscription: {
      toJSON(): unknown;
      unsubscribe(): Promise<boolean>;
    } | null = null;
    const fakeRegistration = {
      pushManager: {
        subscribe: async () => {
          subscription = {
            toJSON: () => ({
              endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
              keys: { p256dh: "p256dh-key", auth: "auth-secret" },
            }),
            unsubscribe: async () => {
              (
                window as unknown as { __unsubscribed: boolean }
              ).__unsubscribed = true;
              subscription = null;
              return true;
            },
          };
          return subscription;
        },
        getSubscription: async () => subscription,
      },
    };
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { ready: Promise.resolve(fakeRegistration) },
      configurable: true,
    });

    let permission: "default" | "denied" | "granted" = initialPermission;
    class FakeNotification {
      static get permission() {
        return permission;
      }
      static requestPermission() {
        permission = "granted";
        return Promise.resolve(permission);
      }
    }
    Object.defineProperty(window, "Notification", {
      value: FakeNotification,
      configurable: true,
    });
  }, initialPermission);
}

// Covers handlePush (ADR 0020): the pure, deps-injected function shared by
// the page (tested here, where nyc collects coverage - the service worker
// itself is disabled under `vite dev`) and sw.ts. Exercised through window.handlePush (main.tsx
// exposes it in DEV) with a real, IndexedDB-backed notificationStore and a
// real encrypted notification keyring built with the actual CryptoService -
// only the notification surface (showNotification/visibleClientRoutes) and
// the network calls (recovery-key, message-by-id) are stubbed.
const DEVICE_ID = TestData.mary.devices[0].deviceId;
const DEVICE_PUBLIC_KEY = TestData.mary.devices[0].publicDeviceKey!;
const RECOVERY_KEY = "the-recovery-key";

interface FixtureChat {
  owner: string;
  chatId: string;
  key: JsonWebKey;
  title: string;
  route: string;
  group: boolean;
}

async function buildRecord(
  chats: Record<string, FixtureChat>,
  names: Record<string, string> = {},
  overrides: Partial<{
    recoveryBlob: string;
    publicDeviceKey: JsonWebKey;
    keyring: string;
    language: string;
  }> = {},
) {
  const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
    TestData.mary.devices[0].encryptedPrivateDeviceKey,
    TestData.mary.password,
  );
  const recoveryBlob = await cryptoService.encryptPrivatePasswordKey(
    privateDeviceKey,
    RECOVERY_KEY,
  );
  const keyringKey = await cryptoService.deriveNotificationKeyringKey(
    privateDeviceKey,
    DEVICE_PUBLIC_KEY,
    MARY_ID,
    DEVICE_ID,
  );
  const keyring = await cryptoService.encryptMessage(
    JSON.stringify({ chats, names }),
    keyringKey,
  );
  return {
    userId: MARY_ID,
    deviceId: DEVICE_ID,
    recoveryBlob,
    publicDeviceKey: DEVICE_PUBLIC_KEY,
    keyring,
    language: "en",
    ...overrides,
  };
}

async function routeRecoveryKey(page: Page, status = 200) {
  await page.route(`**/devices/${DEVICE_ID}/recovery-key`, (route) =>
    status === 200
      ? route.fulfill({ json: RECOVERY_KEY })
      : route.fulfill({ status }),
  );
}

async function routeMessage(
  page: Page,
  owner: string,
  chatId: string,
  messageId: string,
  body: { sender: string; content: string } | undefined,
) {
  await page.route(
    `**/users/${owner}/documents/${chatId}/messages/${messageId}`,
    (route) =>
      body ? route.fulfill({ json: body }) : route.fulfill({ status: 404 }),
  );
}

// Runs handlePush in the page with a record pre-loaded into the real
// notificationStore (or none, for the no-record fallback), fake
// showNotification/visibleClientRoutes, and window.fetch (so the
// page.route()s above take effect). Returns whatever showNotification was
// called with.
async function callHandlePush(
  page: Page,
  payload: unknown,
  record: Awaited<ReturnType<typeof buildRecord>> | undefined,
  options: { visibleRoute?: string; isWebKit?: boolean } = {},
) {
  return page.evaluate(
    async ({ payload, record, options }) => {
      if (record) {
        await window.notificationStore.patch(record.deviceId, record);
      }
      const notifications: { title: string; options: NotificationOptions }[] =
        [];
      await window.handlePush(payload, {
        fetch: window.fetch.bind(window),
        store: window.notificationStore,
        showNotification: async (title, opts) => {
          notifications.push({ title, options: opts });
        },
        visibleClientRoutes: async () =>
          options.visibleRoute ? [options.visibleRoute] : [],
        isWebKit: options.isWebKit ?? false,
        translate: window.createTranslator,
        defaultLanguage: "en",
      });
      return { notifications };
    },
    { payload, record, options },
  );
}

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("a 1:1 message shows the decrypted preview", async ({ page }) => {
  const key = await cryptoService.generateSymmetricKey();
  const encryptedContent = await cryptoService.encryptMessage("Hi there!", key);
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });

  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "chat-laura", "msg-1", {
    sender: "laura-id",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-1",
    },
    record,
  );

  expect(notifications).toHaveLength(1);
  expect(notifications[0].title).toBe("Laura");
  expect(notifications[0].options.body).toBe("Hi there!");
  expect(notifications[0].options.tag).toBe("chat-laura");
  expect((notifications[0].options.data as { route: string }).route).toBe(
    "/chats/laura-id",
  );
});

test("a group message from a known sender is prefixed with their name", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const encryptedContent = await cryptoService.encryptMessage(
    "See you tomorrow",
    key,
  );
  const record = await buildRecord(
    {
      "group-1": {
        owner: MARY_ID,
        chatId: "group-1",
        key,
        title: "Book Club",
        route: "/chats/groups/group-1",
        group: true,
      },
    },
    { "laura-id": "Laura" },
  );

  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "group-1", "msg-2", {
    sender: "laura-id",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "group-1",
      messageId: "msg-2",
    },
    record,
  );

  expect(notifications[0].title).toBe("Book Club");
  expect(notifications[0].options.body).toBe("Laura: See you tomorrow");
});

test("a group message from an unrecognized sender falls back to 'Someone'", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const encryptedContent = await cryptoService.encryptMessage("Hi all", key);
  const record = await buildRecord({
    "group-1": {
      owner: MARY_ID,
      chatId: "group-1",
      key,
      title: "Book Club",
      route: "/chats/groups/group-1",
      group: true,
    },
  });

  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "group-1", "msg-3", {
    sender: "unknown-member",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "group-1",
      messageId: "msg-3",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("Someone: Hi all");
});

test("a shared-document message shows a generic 'shared a picture' preview", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const encryptedContent = await cryptoService.encryptMessage(
    JSON.stringify({
      type: "shared-document",
      documentId: "doc-1",
      owner: "laura-id",
    }),
    key,
  );
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });

  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "chat-laura", "msg-4", {
    sender: "laura-id",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-4",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("Shared a document");
});

test("a group-invitation message shows an 'invites you to' preview", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const encryptedContent = await cryptoService.encryptMessage(
    JSON.stringify({
      type: "group-invitation",
      groupId: "group-9",
      owner: "laura-id",
      name: "Book Club",
    }),
    key,
  );
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });

  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "chat-laura", "msg-5", {
    sender: "laura-id",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-5",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("Invites you to Book Club");
});

test("a long message preview is truncated to 120 characters", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const longText = "x".repeat(200);
  const encryptedContent = await cryptoService.encryptMessage(longText, key);
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });

  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "chat-laura", "msg-6", {
    sender: "laura-id",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-6",
    },
    record,
  );

  const body = notifications[0].options.body as string;
  expect(body).toHaveLength(120);
  expect(body.endsWith("…")).toBe(true);
});

test("falls back to a generic notification when there is no store record for the recipient", async ({
  page,
}) => {
  await setupMarysDevice(page);

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-7",
    },
    undefined,
  );

  expect(notifications).toHaveLength(1);
  expect(notifications[0].options.body).toBe("New message");
  expect(notifications[0].options.tag).toBe("imagey");
  expect((notifications[0].options.data as { route: string }).route).toBe(
    "/chats",
  );
});

test("falls back to a generic notification when the chat is missing from the keyring", async ({
  page,
}) => {
  const record = await buildRecord({});
  await setupMarysDevice(page);
  await routeRecoveryKey(page);

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-8",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("New message");
});

test("falls back to a generic notification when fetching the recovery key fails", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });
  await setupMarysDevice(page);
  await routeRecoveryKey(page, 401);

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-9",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("New message");
});

test("falls back to a generic notification when the message can no longer be loaded", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });
  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "chat-laura", "msg-10", undefined);

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-10",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("New message");
});

test("falls back to a generic notification when the keyring can't be decrypted", async ({
  page,
}) => {
  const record = await buildRecord(
    {},
    {},
    { keyring: "not-a-valid-ciphertext" },
  );
  await setupMarysDevice(page);
  await routeRecoveryKey(page);

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-11",
    },
    record,
  );

  expect(notifications[0].options.body).toBe("New message");
});

test("a contact-request push shows a generic text without any network request", async ({
  page,
}) => {
  await setupMarysDevice(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  const { notifications } = await callHandlePush(
    page,
    { type: "contact-request", recipient: MARY_ID },
    undefined,
  );

  expect(notifications[0].options.body).toBe("New contact request");
  expect(notifications[0].options.tag).toBe("imagey");
  expect(requests.some((url) => url.includes("recovery-key"))).toBe(false);
});

test("notificationStore.list returns every stored device record", async ({
  page,
}) => {
  await setupMarysDevice(page);

  const records = await page.evaluate(async (deviceId) => {
    await window.notificationStore.patch(deviceId, {
      userId: "some-user",
      deviceId,
    });
    return window.notificationStore.list();
  }, DEVICE_ID);

  expect(records).toContainEqual(
    expect.objectContaining({ deviceId: DEVICE_ID, userId: "some-user" }),
  );
});

test("a contact-accepted push shows a generic text", async ({ page }) => {
  await setupMarysDevice(page);

  const { notifications } = await callHandlePush(
    page,
    { type: "contact-accepted", recipient: MARY_ID },
    undefined,
  );

  expect(notifications[0].options.body).toBe("Contact request accepted");
});

test("an invalid or recipient-less payload falls back to a generic notification", async ({
  page,
}) => {
  await setupMarysDevice(page);

  const withoutRecipient = await callHandlePush(
    page,
    { type: "message", owner: MARY_ID, chatId: "chat-laura", messageId: "x" },
    undefined,
  );
  expect(withoutRecipient.notifications[0].options.body).toBe("New message");

  const garbage = await callHandlePush(page, "not an object", undefined);
  expect(garbage.notifications[0].options.body).toBe("New message");
});

test("suppresses the notification when a client is visible on the chat's route", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });
  await setupMarysDevice(page);
  await routeRecoveryKey(page);

  const payload = {
    type: "message",
    recipient: MARY_ID,
    owner: MARY_ID,
    chatId: "chat-laura",
    messageId: "msg-12",
  };
  const { notifications } = await callHandlePush(page, payload, record, {
    visibleRoute: "/chats/laura-id",
  });

  expect(notifications).toHaveLength(0);
});

test("does not suppress on WebKit even when a client is visible on the chat's route", async ({
  page,
}) => {
  const key = await cryptoService.generateSymmetricKey();
  const encryptedContent = await cryptoService.encryptMessage("hey", key);
  const record = await buildRecord({
    "chat-laura": {
      owner: MARY_ID,
      chatId: "chat-laura",
      key,
      title: "Laura",
      route: "/chats/laura-id",
      group: false,
    },
  });
  await setupMarysDevice(page);
  await routeRecoveryKey(page);
  await routeMessage(page, MARY_ID, "chat-laura", "msg-13", {
    sender: "laura-id",
    content: encryptedContent,
  });

  const { notifications } = await callHandlePush(
    page,
    {
      type: "message",
      recipient: MARY_ID,
      owner: MARY_ID,
      chatId: "chat-laura",
      messageId: "msg-13",
    },
    record,
    { visibleRoute: "/chats/laura-id", isWebKit: true },
  );

  expect(notifications).toHaveLength(1);
  expect(notifications[0].options.body).toBe("hey");
});

// -------------------------------------------------------------------------
// PushSubscriptionService / PushResource contract (ADR 0020)
// -------------------------------------------------------------------------

test("PushResource.vapidPublicKey: 404 is surfaced as `undefined`", async ({
  page,
}) => {
  await provider
    .addInteraction()
    .uponReceiving("a request for the VAPID public key while push is disabled")
    .withRequest("GET", "/users/push/vapid-public-key", (r) =>
      r.headers({ Accept: "text/plain" }),
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      const result = await page.evaluate(() =>
        window.pushSubscriptionRepository.loadVapidKey(),
      );

      expect(result).toBeUndefined();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("PUT push-subscription stores the subscription for the bound device", async ({
  page,
}) => {
  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("mary is signed in with her first device")
    .uponReceiving("a request of mary to store a push subscription")
    .withRequest(
      "PUT",
      `/users/${MARY_ID}/devices/${DEVICE_ID}/push-subscription`,
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          endpoint: Matchers.string("https://fcm.googleapis.com/fcm/send/abc"),
          p256dh: Matchers.string(FAKE_P256DH),
          auth: Matchers.string(FAKE_AUTH),
        }),
    )
    .willRespondWith(204)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      const result = await page.evaluate(
        async ({ userId, endpoint, p256dh, auth }) => {
          await window.pushSubscriptionRepository.store(
            userId,
            "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c",
            { endpoint, keys: { p256dh, auth } },
          );
          return "ok";
        },
        {
          userId: MARY_ID,
          endpoint: "https://fcm.googleapis.com/fcm/send/abc",
          p256dh: FAKE_P256DH,
          auth: FAKE_AUTH,
        },
      );

      expect(result).toBe("ok");
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("DELETE push-subscription removes it", async ({ page }) => {
  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("mary is signed in with her first device")
    .uponReceiving("a request of mary to delete her push subscription")
    .withRequest(
      "DELETE",
      `/users/${MARY_ID}/devices/${DEVICE_ID}/push-subscription`,
    )
    .willRespondWith(204)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      const result = await page.evaluate(async (userId) => {
        await window.pushSubscriptionRepository.remove(
          userId,
          "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c",
        );
        return "ok";
      }, MARY_ID);

      expect(result).toBe("ok");
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("pushSubscriptionService.enable subscribes, stores the subscription and makes isEnabled true", async ({
  page,
}) => {
  await stubPushApis(page);
  // The init script above only takes effect from the next navigation on -
  // clear localStorage's own goto (beforeEach) already happened.
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);

  const result = await page.evaluate(
    async ({ userId, deviceId }) => {
      const deviceKeyPair = { publicKey: {}, privateKey: {} };
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);
      return window.pushSubscriptionService.isEnabled(deviceId);
    },
    { userId: MARY_ID, deviceId: DEVICE_ID },
  );

  expect(result).toBe(true);
});

test("pushSubscriptionService.enable rejects when push is disabled server-side", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ status: 404 }),
  );
  await setupMarysDevice(page);

  const message = await page.evaluate(async (userId) => {
    const deviceKeyPair = { publicKey: {}, privateKey: {} };
    try {
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);
      return "<resolved>";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, MARY_ID);

  expect(message).toBe("Push notifications are disabled on this server");
});

test("pushSubscriptionService.disable only unsubscribes once no account uses the browser subscription any more", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route("**/push-subscription", (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);

  const outcome = await page.evaluate(
    async ({ userId, otherUserId, otherDeviceId }) => {
      const deviceKeyPair = { publicKey: {}, privateKey: {} };
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);
      // A second account in the same browser profile, sharing the one
      // browser subscription (ADR 0020 decision 3).
      localStorage.setItem(`imagey.deviceIds[${otherUserId}]`, otherDeviceId);
      await window.notificationStore.patch(otherDeviceId, {
        userId: otherUserId,
      });

      await window.pushSubscriptionService.disable(userId, undefined);
      const stillSubscribedForOther =
        (await window.notificationStore.load(otherDeviceId)) != null;
      const unsubscribedAfterFirst = (
        window as unknown as { __unsubscribed?: boolean }
      ).__unsubscribed;

      await window.pushSubscriptionService.disable(otherUserId, undefined);
      const unsubscribedAfterLast = (
        window as unknown as { __unsubscribed?: boolean }
      ).__unsubscribed;

      return {
        stillSubscribedForOther,
        unsubscribedAfterFirst: !!unsubscribedAfterFirst,
        unsubscribedAfterLast: !!unsubscribedAfterLast,
      };
    },
    {
      userId: MARY_ID,
      otherUserId: "other-account",
      otherDeviceId: "other-device",
    },
  );

  expect(outcome.stillSubscribedForOther).toBe(true);
  expect(outcome.unsubscribedAfterFirst).toBe(false);
  expect(outcome.unsubscribedAfterLast).toBe(true);
});

test("notificationKeyringService: sync/rememberChat/rememberNames on an active (keep-me-logged-in) device", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route("**/push-subscription", (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);

  // "Keep me logged in": a recovery blob in localStorage is what
  // notificationKeyringService.isActive checks for, alongside the store
  // record enable() below creates.
  const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
    TestData.mary.devices[0].encryptedPrivateDeviceKey,
    TestData.mary.password,
  );
  const recoveryBlob = await cryptoService.encryptPrivatePasswordKey(
    privateDeviceKey,
    "any-recovery-key",
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].recovery-key`, key),
    { deviceId: DEVICE_ID, key: recoveryBlob },
  );

  const outcome = await page.evaluate(
    async ({ userId, publicDeviceKey, privateDeviceKey }) => {
      const deviceKeyPair = {
        publicKey: publicDeviceKey,
        privateKey: privateDeviceKey,
      };
      // First sync: creates the (still empty) encrypted keyring - covers
      // the "no prior keyring" branch (NotificationKeyring.emptyKeyring).
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);

      await window.notificationKeyringService.rememberChat(
        userId,
        deviceKeyPair,
        {
          owner: userId,
          chatId: "chat-laura",
          key: { kty: "oct", k: "AAAA" },
          title: "Laura",
          route: "/chats/laura-id",
          group: false,
        },
      );
      await window.notificationKeyringService.rememberNames(
        userId,
        deviceKeyPair,
        [
          {
            userId: "laura-id",
            chatId: "chat-laura",
            owner: userId,
            name: "Laura",
            profileRevision: "1",
          },
        ],
      );
      // fillMissing with nothing actually missing - covers its own control
      // flow without needing a full contact/group fixture.
      await window.notificationKeyringService.fillMissing(
        userId,
        deviceKeyPair,
        { contacts: [], groups: [] },
        "chats-id",
        { kty: "oct", k: "AAAA" },
      );

      const keyring = await window.notificationKeyringService.load(
        userId,
        deviceKeyPair,
      );
      return {
        isActive: await window.notificationKeyringService.isActive(userId),
        chatTitle: keyring?.chats["chat-laura"]?.title,
        name: keyring?.names["laura-id"],
      };
    },
    {
      userId: MARY_ID,
      publicDeviceKey: TestData.mary.devices[0].publicDeviceKey,
      privateDeviceKey,
    },
  );

  expect(outcome.isActive).toBe(true);
  expect(outcome.chatTitle).toBe("Laura");
  expect(outcome.name).toBe("Laura");
});

test("notificationKeyringService keeps every entry when several updates run at once", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route("**/push-subscription", (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);
  const privateDeviceKey = await marysPrivateDeviceKey();
  const recoveryBlob = await cryptoService.encryptPrivatePasswordKey(
    privateDeviceKey,
    "any-recovery-key",
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].recovery-key`, key),
    { deviceId: DEVICE_ID, key: recoveryBlob },
  );

  // Chat.tsx renders the chat list too, so remembering the open chat and
  // refreshing the contact names really do run at the same time.
  const keyring = await page.evaluate(
    async ({ userId, publicDeviceKey, privateDeviceKey }) => {
      const deviceKeyPair = {
        publicKey: publicDeviceKey,
        privateKey: privateDeviceKey,
      };
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);
      const chat = (chatId: string) => ({
        owner: userId,
        chatId,
        key: { kty: "oct", k: "AAAA" },
        title: chatId,
        route: `/chats/${chatId}`,
        group: false,
      });
      await Promise.all([
        window.notificationKeyringService.rememberChat(
          userId,
          deviceKeyPair,
          chat("chat-1"),
        ),
        window.notificationKeyringService.rememberChat(
          userId,
          deviceKeyPair,
          chat("chat-2"),
        ),
        window.notificationKeyringService.rememberNames(userId, deviceKeyPair, [
          {
            userId: "laura-id",
            chatId: "chat-1",
            owner: userId,
            name: "Laura",
            profileRevision: "1",
          },
        ]),
      ]);
      return window.notificationKeyringService.load(userId, deviceKeyPair);
    },
    {
      userId: MARY_ID,
      publicDeviceKey: TestData.mary.devices[0].publicDeviceKey,
      privateDeviceKey,
    },
  );

  expect(Object.keys(keyring?.chats ?? {}).sort()).toEqual([
    "chat-1",
    "chat-2",
  ]);
  expect(keyring?.names["laura-id"]).toBe("Laura");
});

test("pushSubscriptionService.enable drops stale records of the same account but not of other accounts", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route("**/push-subscription", (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);

  const deviceIds = await page.evaluate(
    async ({ userId }) => {
      // An earlier registration of the same account in this browser, and
      // another account's device.
      await window.notificationStore.patch("old-device-of-mary", {
        userId,
        deviceId: "old-device-of-mary",
      });
      await window.notificationStore.patch("device-of-alice", {
        userId: "alice-id",
        deviceId: "device-of-alice",
      });
      await window.pushSubscriptionService.enable(userId, {
        publicKey: {},
        privateKey: {},
      });
      return (await window.notificationStore.list())
        .map((record) => record.deviceId)
        .sort();
    },
    { userId: MARY_ID },
  );

  expect(deviceIds).toEqual([DEVICE_ID, "device-of-alice"].sort());
  // The one record loadForUser can find for Mary is now unambiguous.
  const record = await page.evaluate(
    (userId) => window.notificationStore.loadForUser(userId),
    MARY_ID,
  );
  expect(record?.deviceId).toBe(DEVICE_ID);
});

test("notificationKeyringService.fillMissing loads the chat key of every contact and group not yet in the keyring", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route("**/push-subscription", (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);

  const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
    TestData.mary.devices[0].encryptedPrivateDeviceKey,
    TestData.mary.password,
  );
  const recoveryBlob = await cryptoService.encryptPrivatePasswordKey(
    privateDeviceKey,
    "any-recovery-key",
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].recovery-key`, key),
    { deviceId: DEVICE_ID, key: recoveryBlob },
  );

  // A self-owned 1:1 chat (ContactService.loadChatKey's owner branch: the
  // key is filed under the "chats" document's own kid) and a self-owned
  // group (fillMissing's own owner branch, via documentService.loadDocument
  // directly) - both reached over the network, encrypted for real with the
  // actual CryptoService. A third, member-owned group is reached with no
  // network call at all (its key is already cached on the GroupEntry), and
  // a fourth, broken contact exercises the per-entry catch (one bad entry
  // must not stop the others).
  const chatsId = "chats-doc-fixture";
  const chatsDocumentKey = await cryptoService.generateSymmetricKey();
  const contactChatKey = await cryptoService.generateSymmetricKey();
  const groupChatKey = await cryptoService.generateSymmetricKey();

  async function encryptedDocumentBody(
    key: JsonWebKey,
    metadata: Record<string, unknown>,
  ) {
    const [encrypted] = await cryptoService.encryptDocument(key, [
      new TextEncoder().encode(JSON.stringify(metadata)).buffer as ArrayBuffer,
    ]);
    return Buffer.from(encrypted);
  }

  await page.route(`**/users/${MARY_ID}/documents/chat-with-laura`, (route) =>
    route.request().method() === "GET"
      ? encryptedDocumentBody(contactChatKey, {
          name: "Laura",
          type: "chat",
          publicProfiles: {},
        }).then((body) => route.fulfill({ body }))
      : route.fallback(),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/chat-with-laura/keys/${chatsId}`,
    (route) =>
      cryptoService
        .encryptKey(contactChatKey, chatsDocumentKey)
        .then((sharedKey) => route.fulfill({ json: { sharedKey } })),
  );
  await page.route(`**/users/${MARY_ID}/documents/book-club`, (route) =>
    route.request().method() === "GET"
      ? encryptedDocumentBody(groupChatKey, {
          name: "Book Club",
          type: "group",
          members: [MARY_ID],
          publicProfiles: {},
        }).then((body) => route.fulfill({ body }))
      : route.fallback(),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/book-club/keys/${chatsId}`,
    (route) =>
      cryptoService
        .encryptKey(groupChatKey, chatsDocumentKey)
        .then((sharedKey) => route.fulfill({ json: { sharedKey } })),
  );
  await page.route(`**/users/${MARY_ID}/documents/broken-chat`, (route) =>
    route.fulfill({ status: 404 }),
  );
  // An owned "group" entry whose document turns out to be a plain chat -
  // fillMissing's own doc.type guard must skip it without adding anything.
  await page.route(
    `**/users/${MARY_ID}/documents/not-actually-a-group`,
    (route) =>
      route.request().method() === "GET"
        ? encryptedDocumentBody(groupChatKey, {
            name: "Not A Group",
            type: "chat",
            publicProfiles: {},
          }).then((body) => route.fulfill({ body }))
        : route.fallback(),
  );
  await page.route(
    `**/users/${MARY_ID}/documents/not-actually-a-group/keys/${chatsId}`,
    (route) =>
      cryptoService
        .encryptKey(groupChatKey, chatsDocumentKey)
        .then((sharedKey) => route.fulfill({ json: { sharedKey } })),
  );

  const outcome = await page.evaluate(
    async ({
      userId,
      publicDeviceKey,
      privateDeviceKey,
      chatsId,
      chatsDocumentKey,
    }) => {
      const deviceKeyPair = {
        publicKey: publicDeviceKey,
        privateKey: privateDeviceKey,
      };
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);

      // Already in the keyring - fillMissing must skip both without any
      // network call (no route is registered for either).
      await window.notificationKeyringService.rememberChat(
        userId,
        deviceKeyPair,
        {
          owner: userId,
          chatId: "known-chat",
          key: { kty: "oct", k: "AAAA" },
          title: "Pre-existing Chat",
          route: "/chats/known",
          group: false,
        },
      );
      await window.notificationKeyringService.rememberChat(
        userId,
        deviceKeyPair,
        {
          owner: userId,
          chatId: "known-group",
          key: { kty: "oct", k: "AAAA" },
          title: "Pre-existing Group",
          route: "/chats/groups/known",
          group: true,
        },
      );

      await window.notificationKeyringService.fillMissing(
        userId,
        deviceKeyPair,
        {
          contacts: [
            {
              userId: "laura-id",
              chatId: "chat-with-laura",
              owner: userId,
              name: "Laura",
              profileRevision: "1",
            },
            {
              userId: "broken-contact",
              chatId: "broken-chat",
              owner: userId,
              name: "Broken",
              profileRevision: "1",
            },
            {
              userId: "known-id",
              chatId: "known-chat",
              owner: userId,
              name: "Known",
              profileRevision: "1",
            },
          ],
          groups: [
            { groupId: "book-club", owner: userId, name: "Book Club" },
            {
              groupId: "member-group",
              owner: "someone-else",
              name: "Someone Else's Group",
              groupKey: { kty: "oct", k: "AAAA" },
            },
            { groupId: "known-group", owner: userId, name: "Known Group" },
            {
              groupId: "not-actually-a-group",
              owner: userId,
              name: "Not A Group",
            },
            {
              groupId: "member-no-key",
              owner: "someone-else",
              name: "No Key",
            },
          ],
        },
        chatsId,
        chatsDocumentKey,
      );

      const keyring = await window.notificationKeyringService.load(
        userId,
        deviceKeyPair,
      );
      return {
        contactChat: keyring?.chats["chat-with-laura"],
        groupChat: keyring?.chats["book-club"],
        memberGroupChat: keyring?.chats["member-group"],
        brokenChat: keyring?.chats["broken-chat"],
        knownChatTitle: keyring?.chats["known-chat"]?.title,
        knownGroupTitle: keyring?.chats["known-group"]?.title,
        notActuallyAGroup: keyring?.chats["not-actually-a-group"],
        memberNoKey: keyring?.chats["member-no-key"],
      };
    },
    {
      userId: MARY_ID,
      publicDeviceKey: TestData.mary.devices[0].publicDeviceKey,
      privateDeviceKey,
      chatsId,
      chatsDocumentKey,
    },
  );

  expect(outcome.contactChat).toMatchObject({
    owner: MARY_ID,
    chatId: "chat-with-laura",
    title: "Laura",
    route: "/chats/laura-id",
    group: false,
  });
  expect(outcome.groupChat).toMatchObject({
    owner: MARY_ID,
    chatId: "book-club",
    title: "Book Club",
    route: "/chats/groups/book-club",
    group: true,
  });
  expect(outcome.memberGroupChat).toMatchObject({
    owner: "someone-else",
    chatId: "member-group",
    title: "Someone Else's Group",
    route: "/chats/groups/member-group",
    group: true,
  });
  expect(outcome.brokenChat).toBeUndefined();
  expect(outcome.knownChatTitle).toBe("Pre-existing Chat");
  expect(outcome.knownGroupTitle).toBe("Pre-existing Group");
  expect(outcome.notActuallyAGroup).toBeUndefined();
  expect(outcome.memberNoKey).toBeUndefined();
});

test("pushSubscriptionService.support reports 'denied' when notifications are blocked", async ({
  page,
}) => {
  await stubPushApis(page, "denied");
  await page.reload();
  await setupMarysDevice(page);

  const result = await page.evaluate(() =>
    window.pushSubscriptionService.support(),
  );

  expect(result).toBe("denied");
});

test.describe("on an iPhone that has not been installed to the home screen", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("pushSubscriptionService.support reports 'needs-install'", async ({
    page,
  }) => {
    await stubPushApis(page);
    await page.reload();
    await setupMarysDevice(page);

    const result = await page.evaluate(() =>
      window.pushSubscriptionService.support(),
    );

    expect(result).toBe("needs-install");
  });
});

test("pushSubscriptionRepository.store maps 401/403/404/503 to the matching ResponseError", async ({
  page,
}) => {
  await setupMarysDevice(page);

  for (const status of [401, 403, 404, 503]) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) =>
      route.fulfill({ status }),
    );

    const message = await page.evaluate(
      async ({ userId, deviceId }) => {
        try {
          await window.pushSubscriptionRepository.store(userId, deviceId, {
            endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
            keys: { p256dh: "p256dh-key", auth: "auth-secret" },
          });
          return "<resolved>";
        } catch (e) {
          return String(e);
        }
      },
      { userId: MARY_ID, deviceId: DEVICE_ID },
    );

    expect(message).not.toBe("<resolved>");
  }
});

test("pushSubscriptionService.isEnabled is false before anything ever subscribed", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await setupMarysDevice(page);

  const result = await page.evaluate(() =>
    window.pushSubscriptionService.isEnabled(
      "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c",
    ),
  );

  expect(result).toBe(false);
});

test("pushSubscriptionService.isEnabled/disable tolerate a rejected serviceWorkerReady", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push-subscription", (route) =>
    route.fulfill({ status: 204 }),
  );
  await setupMarysDevice(page);

  const outcome = await page.evaluate(async (deviceId) => {
    const rejected = () => Promise.reject(new Error("no service worker"));
    const enabledDespiteNoSw = await window.pushSubscriptionService.isEnabled(
      deviceId,
      rejected(),
    );
    await window.pushSubscriptionService.disable(
      "d20cf443-4f96-418f-a957-c8cbef8677c3",
      undefined,
      rejected(),
    );
    // A registration that resolves but whose getSubscription() rejects -
    // isEnabled/disable must tolerate that too, not just a rejected
    // serviceWorkerReady itself.
    const brokenRegistration = Promise.resolve({
      pushManager: {
        getSubscription: () => Promise.reject(new Error("no subscription")),
      },
    } as unknown as ServiceWorkerRegistration);
    const enabledDespiteBrokenGetSubscription =
      await window.pushSubscriptionService.isEnabled(
        deviceId,
        brokenRegistration,
      );
    await window.pushSubscriptionService.disable(
      "d20cf443-4f96-418f-a957-c8cbef8677c3",
      undefined,
      brokenRegistration,
    );
    return { enabledDespiteNoSw, enabledDespiteBrokenGetSubscription };
  }, DEVICE_ID);

  expect(outcome.enabledDespiteNoSw).toBe(false);
  expect(outcome.enabledDespiteBrokenGetSubscription).toBe(false);
});

test("pushSubscriptionService.disable logs a warning but still cleans up when removing the server-side subscription fails", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 500 }),
  );
  await setupMarysDevice(page);

  const outcome = await page.evaluate(
    async ({ userId, deviceId }) => {
      const deviceKeyPair = { publicKey: {}, privateKey: {} };
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);
      await window.pushSubscriptionService.disable(userId, undefined);
      return (await window.notificationStore.load(deviceId)) == null;
    },
    { userId: MARY_ID, deviceId: DEVICE_ID },
  );

  expect(outcome).toBe(true);
});

// Mary's device private key, decrypted for real - a bound session is
// established by signing a challenge with it (ADR 0018).
async function marysPrivateDeviceKey() {
  return cryptoService.decryptPrivatePasswordKey(
    TestData.mary.devices[0].encryptedPrivateDeviceKey,
    TestData.mary.password,
  );
}

// The server side of binding a session: a challenge of Mary's device and its
// acceptance. The requests are counted to prove the binding happened.
async function routeSessionBinding(page: Page) {
  const bound = { challenges: 0, authentications: 0 };
  await page.route("**/devices/*/challenges", (route) => {
    bound.challenges++;
    return route.fulfill({
      json: {
        ephemeralPublicKey: {
          crv: TestData.mary.publicMainKey.crv,
          kty: TestData.mary.publicMainKey.kty,
          x: TestData.mary.publicMainKey.x,
          y: TestData.mary.publicMainKey.y,
        },
        nonce: "some-random-nonce",
      },
      status: 201,
    });
  });
  await page.route("**/devices/*/authentications*", (route) => {
    bound.authentications++;
    return route.fulfill({ status: 200 });
  });
  return bound;
}

test("pushSubscriptionService.disable binds the session and retries when the server rejects the delete as unbound", async ({
  page,
}) => {
  await stubPushApis(page);
  await page.reload();
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
  );
  await setupMarysDevice(page);
  const privateDeviceKey = await marysPrivateDeviceKey();
  const deletes: number[] = [];
  await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) => {
    if (route.request().method() === "DELETE") {
      deletes.push(deletes.length);
      return route.fulfill({ status: deletes.length === 1 ? 403 : 204 });
    }
    return route.fulfill({ status: 204 });
  });
  const bound = await routeSessionBinding(page);

  const storeRecordAfter = await page.evaluate(
    async ({ userId, deviceId, privateDeviceKey }) => {
      const deviceKeyPair = { publicKey: {}, privateKey: privateDeviceKey };
      await window.pushSubscriptionService.enable(userId, deviceKeyPair);
      await window.pushSubscriptionService.disable(userId, deviceKeyPair);
      return window.notificationStore.load(deviceId);
    },
    { userId: MARY_ID, deviceId: DEVICE_ID, privateDeviceKey },
  );

  expect(deletes).toHaveLength(2);
  expect(bound.challenges).toBe(1);
  expect(bound.authentications).toBe(1);
  expect(storeRecordAfter).toBeUndefined();
});

test.describe("pushSubscriptionService.reconcile", () => {
  async function prepare(
    page: Page,
    permission: "default" | "granted" = "granted",
  ) {
    await stubPushApis(page, permission);
    await page.reload();
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
    );
    const puts: unknown[] = [];
    await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) => {
      puts.push(route.request().postDataJSON());
      return route.fulfill({ status: 204 });
    });
    await setupMarysDevice(page);
    return { puts, privateDeviceKey: await marysPrivateDeviceKey() };
  }

  // Runs reconcile with a store record carrying `recordEndpoint` and, if
  // `browserEndpointKnown`, with the browser already holding a subscription.
  async function reconcile(
    page: Page,
    privateDeviceKey: JsonWebKey,
    options: {
      record: boolean;
      recordEndpoint?: string;
      subscribed?: boolean;
      registration?: "rejected";
    },
  ) {
    return page.evaluate(
      async ({ userId, deviceId, privateDeviceKey, options }) => {
        if (options.record) {
          await window.notificationStore.patch(deviceId, {
            userId,
            deviceId,
            endpoint: options.recordEndpoint,
          });
        }
        const registration = await navigator.serviceWorker.ready;
        if (options.subscribed) {
          await registration.pushManager.subscribe({ userVisibleOnly: true });
        }
        await window.pushSubscriptionService.reconcile(
          userId,
          { publicKey: {}, privateKey: privateDeviceKey },
          options.registration === "rejected"
            ? Promise.reject(new Error("no service worker"))
            : navigator.serviceWorker.ready,
        );
        return (await window.notificationStore.load(deviceId))?.endpoint;
      },
      { userId: MARY_ID, deviceId: DEVICE_ID, privateDeviceKey, options },
    );
  }

  test("does nothing for a device without push enabled", async ({ page }) => {
    const { puts, privateDeviceKey } = await prepare(page);

    const endpoint = await reconcile(page, privateDeviceKey, { record: false });

    expect(endpoint).toBeUndefined();
    expect(puts).toHaveLength(0);
  });

  test("does nothing while the notification permission is not granted", async ({
    page,
  }) => {
    const { puts, privateDeviceKey } = await prepare(page, "default");

    await reconcile(page, privateDeviceKey, {
      record: true,
      recordEndpoint: "https://fcm.googleapis.com/fcm/send/old",
      subscribed: true,
    });

    expect(puts).toHaveLength(0);
  });

  test("does nothing when there is no service worker", async ({ page }) => {
    const { puts, privateDeviceKey } = await prepare(page);

    await reconcile(page, privateDeviceKey, {
      record: true,
      recordEndpoint: "https://fcm.googleapis.com/fcm/send/old",
      registration: "rejected",
    });

    expect(puts).toHaveLength(0);
  });

  test("does nothing when the stored subscription is still the current one", async ({
    page,
  }) => {
    const { puts, privateDeviceKey } = await prepare(page);

    await reconcile(page, privateDeviceKey, {
      record: true,
      recordEndpoint: "https://fcm.googleapis.com/fcm/send/xyz",
      subscribed: true,
    });

    expect(puts).toHaveLength(0);
  });

  test("stores a subscription the browser rotated", async ({ page }) => {
    const { puts, privateDeviceKey } = await prepare(page);

    const endpoint = await reconcile(page, privateDeviceKey, {
      record: true,
      recordEndpoint: "https://fcm.googleapis.com/fcm/send/old",
      subscribed: true,
    });

    expect(puts).toEqual([
      expect.objectContaining({
        endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
      }),
    ]);
    expect(endpoint).toBe("https://fcm.googleapis.com/fcm/send/xyz");
  });

  test("subscribes again when the browser lost its subscription", async ({
    page,
  }) => {
    const { puts, privateDeviceKey } = await prepare(page);

    const endpoint = await reconcile(page, privateDeviceKey, {
      record: true,
      recordEndpoint: "https://fcm.googleapis.com/fcm/send/old",
    });

    expect(puts).toHaveLength(1);
    expect(endpoint).toBe("https://fcm.googleapis.com/fcm/send/xyz");
  });

  test("does not subscribe again once push is disabled server-side", async ({
    page,
  }) => {
    const { puts, privateDeviceKey } = await prepare(page);
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ status: 404 }),
    );

    await reconcile(page, privateDeviceKey, {
      record: true,
      recordEndpoint: "https://fcm.googleapis.com/fcm/send/old",
    });

    expect(puts).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
// UI: NotificationSettings / NotificationBanner (ADR 0020)
// -------------------------------------------------------------------------

// Devices.tsx/NotificationSettings share the Settings page shell, whose
// AppBar/avatar also reaches for the profile document - matches
// devices.test.ts's prepareMarysDevicesPage.
async function prepareMarysSettingsPage(page: Page) {
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();
  await prepareMarysEmptyProfile();
  return prepareMarysDocuments();
}

// The chats page alone does not reach for the profile document - matches
// chats.test.ts's "navigate to chats".
async function prepareMarysChatsPage(page: Page) {
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  return prepareMarysContactRequests();
}

// The landing page requests Mary's pictures (prepareMarysDocuments); leaving it
// before they are loaded would end the test with those interactions still
// pending, which only shows on a slow machine.
async function waitForMarysPictures(page: Page) {
  await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
}

async function openChats(page: Page) {
  await loginAsMary(page);
  await waitForMarysPictures(page);
  const chatsLink = page.getByRole("link", { name: "Chats" }).first();
  await expect(chatsLink).toBeVisible();
  await chatsLink.click();
}

async function openNotificationSettings(page: Page) {
  await loginAsMary(page);
  await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
    timeout: 10_000,
  });
  const settingsLink = page.getByRole("link", { name: "Settings" });
  await expect(settingsLink).toBeVisible();
  await settingsLink.click();
  const notificationsLink = page.getByRole("heading", {
    name: "Notifications",
  });
  await expect(notificationsLink).toBeVisible();
  await notificationsLink.click();
}

test("mary turns notifications on and off from Settings", async ({ page }) => {
  await stubPushApis(page);
  const builder = await prepareMarysSettingsPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
    );
    await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await openNotificationSettings(page);

    const toggle = page.getByRole("checkbox");
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    // When - a plain click, not .check(): the toggle is async (awaits
    // pushSubscriptionService.enable), so the native DOM checked state can
    // flip and briefly revert (React re-rendering with the still-pending
    // `enabled` state) before settling - .check()'s own built-in
    // "did the state change" verification races that and flags a false
    // negative. expect().toBeChecked() below polls instead.
    await toggle.click({ force: true });

    // Then
    await expect(toggle).toBeChecked();
    await expect(page.getByText("Notifications on this device")).toBeVisible();

    // When
    await toggle.click({ force: true });

    // Then
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("mary sees an error when turning notifications on fails", async ({
  page,
}) => {
  await stubPushApis(page);
  const builder = await prepareMarysSettingsPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ status: 500 }),
    );
    await openNotificationSettings(page);

    const toggle = page.getByRole("checkbox");
    await expect(toggle).toBeVisible();

    // When
    await toggle.click({ force: true });

    // Then
    await expect(
      page.getByText("Failed to update notification settings"),
    ).toBeVisible();
    await expect(toggle).not.toBeChecked();
  });
});

test("NotificationBanner: dismissing hides it permanently, enabling subscribes and dismisses it", async ({
  page,
}) => {
  await stubPushApis(page);
  const builder = await prepareMarysChatsPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ contentType: "text/plain", body: FAKE_VAPID_KEY }),
    );
    await page.route(`**/devices/${DEVICE_ID}/push-subscription`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await openChats(page);

    const banner = page.getByText(/Get notified about new messages, even when/);
    await expect(banner).toBeVisible();

    // When
    await page.getByRole("button", { name: "Enable" }).click();

    // Then
    await expect(banner).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("NotificationBanner: 'Not now' dismisses it without subscribing", async ({
  page,
}) => {
  await stubPushApis(page);
  const builder = await prepareMarysChatsPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await openChats(page);

    const banner = page.getByText(/Get notified about new messages, even when/);
    await expect(banner).toBeVisible();

    // When
    await page.getByRole("button", { name: "Not now" }).click();

    // Then
    await expect(banner).not.toBeVisible();
    await page.reload();
    // Without keys the reloaded page asks for the password once it has loaded
    // Mary's public key - only then is "no banner" a statement about the page.
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(banner).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("NotificationBanner: a failed enable logs an error and hides the banner (permission was already consumed)", async ({
  page,
}) => {
  await stubPushApis(page);
  const builder = await prepareMarysChatsPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ status: 500 }),
    );
    await openChats(page);

    const banner = page.getByText(/Get notified about new messages, even when/);
    await expect(banner).toBeVisible();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    // When
    await page.getByRole("button", { name: "Enable" }).click();

    // Then - requestPermission() already resolved "granted" before the
    // vapid-key fetch failed, so support() is no longer "default" and the
    // banner does not reappear - the same toggle is still in Settings.
    await expect(banner).not.toBeVisible();
    await expect
      .poll(() =>
        errors.some((e) => e.includes("Failed to enable notifications")),
      )
      .toBe(true);
  });
});

// Makes push "active" (isActive: a recovery blob plus a store record) with a
// keyring that cannot be decrypted, so any subsequent sync/rememberChat/
// rememberNames/fillMissing rejects - exercises the .catch() a page
// component wraps that call in (Chat.tsx/GroupChat.tsx/Chats.tsx), which a
// device without push active - every other test in this file - never
// reaches, since notificationKeyringService.sync is then a silent no-op.
async function setupBrokenActiveKeyring(page: Page) {
  const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
    TestData.mary.devices[0].encryptedPrivateDeviceKey,
    TestData.mary.password,
  );
  const recoveryBlob = await cryptoService.encryptPrivatePasswordKey(
    privateDeviceKey,
    "any-recovery-key",
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].recovery-key`, key),
    { deviceId: DEVICE_ID, key: recoveryBlob },
  );
  await page.evaluate(
    ({ deviceId, userId }) =>
      window.notificationStore.patch(deviceId, {
        userId,
        keyring: "not-a-valid-ciphertext",
      }),
    { deviceId: DEVICE_ID, userId: MARY_ID },
  );
}

test("Chats.tsx logs a warning when refreshing an active but undecryptable notification keyring fails", async ({
  page,
}) => {
  const builder = await prepareMarysChatsPage(page);
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        errors.push(message.text());
      }
    });

    // The recovery blob must be set only after logging in, not before -
    // beforehand it would make the app's own boot sequence attempt a real
    // auto-login instead of the password prompt loginAsMary expects.
    await loginAsMary(page);
    await waitForMarysPictures(page);
    await setupBrokenActiveKeyring(page);
    const chatsLink = page.getByRole("link", { name: "Chats" }).first();
    await expect(chatsLink).toBeVisible();
    await chatsLink.click();

    await expect
      .poll(() =>
        errors.some((e) =>
          e.includes("Failed to refresh the notification keyring"),
        ),
      )
      .toBe(true);
  });
});

test("Chat.tsx logs a warning when remembering a chat in an active but undecryptable keyring fails", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysChat(LAURA_ID, " for notif-catch");
  // Mary's chat with Laura already carries a real seeded message (see
  // "view chat and send message" in chat.test.ts) - this interaction only
  // exists to let the navigation succeed, so it mirrors that one rather
  // than asserting an empty list the backend would never actually return.
  provider
    .addInteraction()
    .uponReceiving("a request to receive messages for the notif-catch test")
    .withRequest("GET", `/users/${MARY_ID}/documents/chat-laura/messages`)
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: Matchers.string("msg-123"),
          content: Matchers.string(TestData.mary.chats![0].messages[0].content),
        },
      ]),
    );
  // Long polling means a second request (with sinceId) may follow.
  const builder = provider
    .addInteraction()
    .uponReceiving(
      "a request to receive more messages for the notif-catch test",
    )
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/chat-laura/messages`,
      (r) => {
        r.query({ sinceId: "msg-123" });
        r.headers({ Prefer: "wait=30" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        errors.push(message.text());
      }
    });

    // The registered long-poll interaction must actually be requested before
    // the mock server goes away, or Pact reports it as "expected but not received".
    const pollResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/chat-laura/messages") &&
        response.url().includes("sinceId=msg-123"),
    );
    await loginAsMary(page);
    await setupBrokenActiveKeyring(page);
    await page.getByRole("link", { name: "Chats" }).first().click();
    const lauraContact = page.getByText("Laura", { exact: true }).first();
    await expect(lauraContact).toBeVisible();
    await lauraContact.click();
    await expect(
      page
        .getByRole("banner")
        .getByRole("heading", { name: "Laura", exact: true }),
    ).toBeVisible();

    await expect
      .poll(() =>
        errors.some((e) =>
          e.includes("Failed to remember chat for notifications"),
        ),
      )
      .toBe(true);
    await pollResponse;
    await expect.poll(() => runningPactRequests).toBe(0);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

test("App logs a warning when reconciling the push subscription fails", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const builder = await prepareMarysContactRequests();
  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") {
        warnings.push(message.text());
      }
    });

    await page.goto("/");
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.pushSubscriptionService.reconcile = () =>
        Promise.reject(new Error("reconcile failed"));
    });
    await inputMarysPassword(page);

    // The landing page is up once Mary's pictures are shown.
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect
      .poll(() =>
        warnings.some((w) =>
          w.includes("Failed to reconcile push subscription"),
        ),
      )
      .toBe(true);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("switching user logs a warning when disabling notifications for the previous user fails", async ({
  page,
}) => {
  await provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key for switch user")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey))
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      const warnings: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "warning") {
          warnings.push(message.text());
        }
      });
      await page.goto(
        "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
      );
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
      await page.evaluate(() => {
        window.pushSubscriptionService.disable = () =>
          Promise.reject(new Error("disable failed"));
      });

      await page.getByText("Sign in with a different email").click();

      await expect(page.getByPlaceholder("email@imagey.cloud")).toBeVisible();
      await expect
        .poll(() =>
          warnings.some((w) => w.includes("Failed to disable notifications")),
        )
        .toBe(true);
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});
