import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  setupMarysDevice,
  inputMarysPassword,
  TestData,
  aesGcmEncrypt,
  encryptKeyEnvelope,
  encryptKeyEnvelopeEcdh,
  generateAesGcmKeyJwk,
} from "./setup";
import type { deviceService } from "../../src/device/DeviceService";
import type { contactService } from "../../src/contact/ContactService";
import type { documentService } from "../../src/document/DocumentService";

declare global {
  interface Window {
    deviceService: typeof deviceService;
    contactService: typeof contactService;
    documentService: typeof documentService;
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

const MARY = "mary@imagey.cloud";

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
      path: "tests/images/encrypted/mary@imagey.cloud/document.enc",
    }),
  );
  await page.route(`**/users/${MARY}/documents/${MARY}/keys/0`, (route) =>
    route.fulfill({
      status: 200,
      path: "tests/images/encrypted/mary@imagey.cloud/keys/0.json",
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
    await page.goto("/?email=mary@imagey.cloud");
    await page.evaluate(() =>
      localStorage.removeItem("imagey.deviceIds[mary@imagey.cloud]"),
    );

    const message = await messageFromBrowser(page, () =>
      window.deviceService.activateDevice(
        "mary@imagey.cloud",
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
    await page.goto("/?email=mary@imagey.cloud");
    await page.evaluate(() =>
      localStorage.removeItem("imagey.deviceIds[mary@imagey.cloud]"),
    );

    const message = await messageFromBrowser(page, () =>
      window.deviceService.unlockDevice("mary@imagey.cloud", "password"),
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
      `**/users/mary@imagey.cloud/devices/${deviceId}/public-keys/0`,
      (route) =>
        route.fulfill({
          status: 200,
          json: TestData.mary.devices[0].publicDeviceKey,
        }),
    );
    await page.goto("/?email=mary@imagey.cloud");
    await page.evaluate(
      (id) => localStorage.removeItem(`imagey.devices[${id}].key`),
      deviceId,
    );

    const message = await messageFromBrowser(page, () =>
      window.deviceService.unlockDevice("mary@imagey.cloud", "password"),
    );

    expect(message).toBe("Private Key missing");
  });

  test("unlockLocalDeviceKey rejects when the local device key is gone", async ({
    page,
  }) => {
    await setupMarysDevice(page);
    const deviceId = TestData.mary.devices[0].deviceId;
    await page.goto("/?email=mary@imagey.cloud");
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
  test("receiveContactRequest rejects an ACCEPTED request with no chatId/sharedKey", async ({
    page,
  }) => {
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.contactService.receiveContactRequest(
        "mary@imagey.cloud",
        {
          inviter: "mary@imagey.cloud",
          invitee: "laura@imagey.cloud",
          publicKey: {} as JsonWebKey,
          status: "ACCEPTED",
        },
        {
          documents: "d",
          chats: "c",
          profile: "p",
          settingsKey: {} as JsonWebKey,
        },
        {
          publicKey: {} as JsonWebKey,
          privateKey: {} as JsonWebKey,
        },
      ),
    );

    expect(message).toBe(
      "Accepted contact request is missing chatId/sharedKey",
    );
  });

  test("acceptContactRequest rejects when the chats document can't be loaded", async ({
    page,
  }) => {
    // documentService.loadDocument() swallows the 500 and returns a
    // key-less placeholder, so acceptContactRequest hits its own
    // "Chats document key not found" guard.
    await page.route(
      "**/users/mary@imagey.cloud/documents/chats-broken",
      (route) => route.fulfill({ status: 500 }),
    );
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.contactService.acceptContactRequest(
        "mary@imagey.cloud",
        "laura@imagey.cloud",
        {} as JsonWebKey,
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

    expect(message).toBe("Chats document key not found");
  });

  test("receiveContactRequest rejects when the chats document can't be loaded", async ({
    page,
  }) => {
    // A self-ECDH-wrapped key so the "can we actually decrypt the chat
    // key?" check passes and we reach the chats-document guard afterwards.
    const chatKey = await generateAesGcmKeyJwk();
    const wrappedChatKey = await encryptKeyEnvelopeEcdh(
      chatKey,
      TestData.mary.privateMainKey!,
      TestData.mary.publicMainKey,
    );
    await page.route(
      "**/users/mary@imagey.cloud/documents/chats-broken",
      (route) => route.fulfill({ status: 500 }),
    );
    await page.goto("/");

    const message = await page.evaluate(
      async ({ wrappedChatKey, pub, priv }) => {
        try {
          await window.contactService.receiveContactRequest(
            "mary@imagey.cloud",
            {
              inviter: "mary@imagey.cloud",
              invitee: "laura@imagey.cloud",
              publicKey: pub as JsonWebKey,
              status: "ACCEPTED",
              chatId: "chat-1",
              sharedKey: wrappedChatKey,
            },
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

    expect(message).toBe("Chats document key not found");
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
        "mary@imagey.cloud",
        { documentId: "doc-1", name: "doc-1" },
        "laura@imagey.cloud",
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
          "mary@imagey.cloud",
          { documentId: "doc-1", name: "doc-1", key: arg.documentKey },
          "laura@imagey.cloud",
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
      window.documentService.loadContent("mary@imagey.cloud", {
        documentId: "doc-1",
        name: "doc-1",
        key: { kty: "oct", k: "irrelevant" } as JsonWebKey,
      }),
    );

    expect(message).toBe(
      "Document has no preview image and no contentId given",
    );
  });

  test("loadContent rejects a key-less document when no parent folder is given", async ({
    page,
  }) => {
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.documentService.loadContent("mary@imagey.cloud", {
        documentId: "doc-1",
        name: "doc-1",
      }),
    );

    expect(message).toBe("Either document.key or folder is required");
  });

  test("loadContent unwraps the document key via the parent folder when the document has none", async ({
    page,
  }) => {
    const owner = "mary@imagey.cloud";
    const documentId = "shared-doc-1";
    const folderId = "parent-folder-1";
    const contentId = "content-1";
    const plaintext = "the decrypted bytes";

    const folderKey = await generateAesGcmKeyJwk();
    const documentKey = await generateAesGcmKeyJwk();
    const wrappedDocumentKey = await encryptKeyEnvelope(documentKey, folderKey);
    const encryptedContent = await aesGcmEncrypt(
      documentKey,
      new TextEncoder().encode(plaintext),
    );

    await page.route(
      `**/users/${owner}/documents/${documentId}/keys/${folderId}`,
      (route) =>
        route.fulfill({
          status: 200,
          json: {
            issuer: owner,
            kid: folderId,
            sharedKey: wrappedDocumentKey,
          },
        }),
    );
    await page.route(
      `**/users/${owner}/documents/${documentId}/files/${contentId}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: encryptedContent,
        }),
    );
    await page.goto("/");

    const decoded = await page.evaluate(
      async ({ owner, documentId, folderId, folderKey, contentId }) => {
        const buffer = await window.documentService.loadContent(
          owner,
          { documentId, name: documentId },
          contentId,
          { id: folderId, key: folderKey as JsonWebKey },
        );
        return new TextDecoder().decode(buffer);
      },
      { owner, documentId, folderId, folderKey, contentId },
    );

    expect(decoded).toBe(plaintext);
  });

  test("getSettings rejects when the settings document is missing its ids", async ({
    page,
  }) => {
    const user = "mary@imagey.cloud";
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
    const user = "mary@imagey.cloud";
    const folderId = "retry-folder";
    const siblingId = "sibling-added-meanwhile";

    const folderKey = await generateAesGcmKeyJwk();
    // The folder as the server has it *after* a sibling was added since the
    // client loaded it - the retry's re-read must pick this sibling up.
    const reloadedFolder = await aesGcmEncrypt(
      folderKey,
      new TextEncoder().encode(
        JSON.stringify({
          documentId: folderId,
          name: "Vacation",
          type: "Folder",
          documents: [siblingId],
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
            type: "Folder",
            documents: [],
            etag: '"folder-v1"',
          },
          folderKey as JsonWebKey,
        );
        return {
          documents: r.parentFolderDocuments,
          etag: r.parentFolderETag,
        };
      },
      { user, folderId, folderKey },
    );

    expect(uploadAttempts).toBe(2);
    // The concurrently-added sibling survived, and the new document sits after it.
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]).toBe(siblingId);
    expect(result.documents[1]).not.toBe(siblingId);
    expect(result.etag).toBe('"folder-v3"');
  });

  test("updateDocumentMetadata rejects with a precondition error when the document changed since load", async ({
    page,
  }) => {
    const user = "mary@imagey.cloud";
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

  test("storeDocument refuses to add to a folder that did not load cleanly", async ({
    page,
  }) => {
    // A failed loadDocument() returns a placeholder flagged `loadFailed` (no
    // documents/etag). Adding to it would persist a one-item child list and
    // silently drop every existing child - storeDocument must reject instead.
    await page.goto("/");

    const message = await messageFromBrowser(page, () =>
      window.documentService.storeDocument(
        "mary@imagey.cloud",
        new File(["hi"], "note.txt", { type: "text/plain" }),
        {
          documentId: "half-loaded-folder",
          name: "Encrypted Document",
          loadFailed: true,
        },
        {} as JsonWebKey,
      ),
    );

    expect(message).toContain("was not loaded cleanly");
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
    await page.route(`**/users/${email}/public-keys/0`, (route) =>
      route.fulfill({ status: 401 }),
    );
    await page.route(`**/users/${email}/verifications/`, (route) =>
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
    await page.route(`**/users/${email}/public-keys/0`, (route) =>
      route.fulfill({ status: 401 }),
    );
    await page.route(`**/users/${email}/verifications/`, (route) =>
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
    await page.route("**/users/mary@imagey.cloud/public-keys/0", (route) =>
      route.fulfill({ status: 401 }),
    );
    await page.route(
      `**/users/mary@imagey.cloud/devices/${deviceId}/challenges`,
      (route) => route.fulfill({ status: 500 }),
    );

    await page.goto("/?email=mary@imagey.cloud");

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
        "mary@imagey.cloud",
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
    // 404 on the public key -> AuthenticationComponent renders the
    // RegistrationDialog.
    await page.route(`**/users/${email}/public-keys/0`, (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.route("**/users", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500 })
        : route.fallback(),
    );

    await page.goto(`/?email=${email}`);

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
      // receive effect - but it carries no chatId/sharedKey, so
      // contactService.receiveContactRequest() rejects.
      await p.route(`**/users/${MARY}/contact-requests`, (route) =>
        route.fulfill({
          status: 200,
          json: [
            {
              inviter: MARY,
              invitee: "laura@imagey.cloud",
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
            path: `tests/images/encrypted/${documentsId}/keys/mary@imagey.cloud.json`,
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
  const chatId = "chat-alice";

  // A real "chats" document listing alice as a contact, encrypted for real
  // so the app gets past that step - only the chat Document's own key
  // entry (registered by the caller) is deliberately broken.
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const chatsContent = await aesGcmEncrypt(
    chatsDocumentKey,
    new TextEncoder().encode(
      JSON.stringify({
        name: "Chats",
        type: "folder",
        contacts: [
          {
            userId: "alice@imagey.cloud",
            chatId,
            owner: "mary@imagey.cloud",
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

  await page.route("**/users/mary@imagey.cloud/public-keys/0", (route) =>
    route.fulfill({ status: 200, json: TestData.mary.publicMainKey }),
  );
  await page.route(
    `**/users/mary@imagey.cloud/devices/${deviceId}/private-keys/0`,
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
    `**/users/mary@imagey.cloud/devices/${deviceId}/public-keys/0`,
    (route) =>
      route.fulfill({
        status: 200,
        json: TestData.mary.devices[0].publicDeviceKey,
      }),
  );
  await page.route(
    "**/users/mary@imagey.cloud/documents/mary@imagey.cloud",
    (route) =>
      route.fulfill({
        status: 200,
        path: "tests/images/encrypted/mary@imagey.cloud/document.enc",
      }),
  );
  await page.route(
    "**/users/mary@imagey.cloud/documents/mary@imagey.cloud/keys/0",
    (route) =>
      route.fulfill({
        status: 200,
        path: "tests/images/encrypted/mary@imagey.cloud/keys/0.json",
      }),
  );
  await page.route("**/users/mary@imagey.cloud/contact-requests", (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route(
    `**/users/mary@imagey.cloud/documents/${documentsId}`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${documentsId}/document-empty-folder.enc`,
      }),
  );
  await page.route(
    `**/users/mary@imagey.cloud/documents/${documentsId}/keys/mary@imagey.cloud`,
    (route) =>
      route.fulfill({
        status: 200,
        path: `tests/images/encrypted/${documentsId}/keys/mary@imagey.cloud.json`,
      }),
  );
  await page.route(`**/users/mary@imagey.cloud/documents/${chatsId}`, (route) =>
    route.fulfill({
      status: 200,
      body: chatsContent,
      contentType: "application/octet-stream",
    }),
  );
  await page.route(
    `**/users/mary@imagey.cloud/documents/${chatsId}/keys/mary@imagey.cloud`,
    (route) =>
      route.fulfill({
        status: 200,
        json: {
          issuer: "mary@imagey.cloud",
          kid: "mary@imagey.cloud",
          sharedKey: chatsWrappedKey,
        },
      }),
  );
  await page.route(`**/users/mary@imagey.cloud/documents/${chatId}`, (route) =>
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
  const aliceContact = page.getByText("alice@imagey.cloud").first();
  await expect(aliceContact).toBeVisible();
  await aliceContact.click();
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
      `**/users/mary@imagey.cloud/documents/${chatId}/keys/${chatsId}`,
      (route) =>
        route.fulfill({
          status: 200,
          json: {
            issuer: "mary@imagey.cloud",
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
      `**/users/mary@imagey.cloud/documents/${chatId}/keys/${chatsId}`,
      (route) => route.fulfill({ status: 404 }),
    );
  });

  await expectDecryptionErrorShown(page);
});
