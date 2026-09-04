import { expect, Page } from "@playwright/test";
import {
  PactV4,
  MatchersV3,
  MatchersV2 as Matchers,
} from "@pact-foundation/pact";
import { webcrypto } from "node:crypto";
import * as fs from "fs";
import { TestData, shortName, LAURA_ID } from "./testdata";

// --- Chats/contact-requests test helpers -----------------------------------
// Contacts/chats are (like documents, folders and the profile) their own
// encrypted Document: the user's "chats" list document holds a
// `contacts: {userId, chatId, owner}[]` array instead of a dedicated
// /users/{id}/contacts endpoint, and each chat itself is now a further
// Document nested under "chats" - its own Document key doubles as the
// chat's message/sharing key (see ContactService.loadChatKey /
// ENCRYPTION.md section 5). Mary's and Bill's settingsKey are known
// statically (see testdata.ts), so - unlike the static binary .enc/.json
// fixtures used elsewhere in this file - we can encrypt genuinely valid
// chats-document and chat-document fixtures for them at test-run time with
// real AES-GCM, instead of hand-authoring ciphertext offline (see
// scripts/encryptMarysDocuments.ts for that older, offline approach).

// The plaintext AES-GCM chat key that a handful of pre-baked static
// fixtures were genuinely encrypted under back when chat keys were
// exchanged via the older /contacts/{email}/key endpoint (mary.chats[].
// messages[].content in testdata.ts, and the hardcoded "shared document"
// message/key-envelope strings in chat.test.ts's "view shared document
// from another user" test). Reusing it here - as the chat Document's own
// key - means those fixtures keep decrypting for real without having to
// re-author them.
const KNOWN_CHAT_KEY: JsonWebKey = {
  key_ops: ["encrypt", "decrypt"],
  ext: true,
  alg: "A256GCM",
  kty: "oct",
  k: "rHlLiQjRuBoEcZCWwG6VuYbgcuiJGN4mmohJn5MHpAU",
};

async function importAesGcmKey(key: JsonWebKey): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    "jwk",
    key,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function aesGcmEncrypt(
  key: JsonWebKey,
  plaintext: Uint8Array,
): Promise<Buffer> {
  const cryptoKey = await importAesGcmKey(key);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext,
  );
  return Buffer.concat([Buffer.from(iv), Buffer.from(encrypted)]);
}

// Encrypts a chat message body under the fixed chat-document key the chat
// mocks use (KNOWN_CHAT_KEY), producing the base64 `content` field the server
// would return - matching cryptoService.encryptMessage on the app side.
export async function encryptKnownChatMessage(
  plaintext: string,
): Promise<string> {
  const encrypted = await aesGcmEncrypt(
    KNOWN_CHAT_KEY,
    new TextEncoder().encode(plaintext),
  );
  return encrypted.toString("base64");
}

async function aesGcmDecrypt(
  key: JsonWebKey,
  payload: Buffer,
): Promise<Buffer> {
  const cryptoKey = await importAesGcmKey(key);
  const iv = payload.subarray(0, 12);
  const ciphertext = payload.subarray(12);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    ciphertext,
  );
  return Buffer.from(decrypted);
}

export async function generateAesGcmKeyJwk(): Promise<JsonWebKey> {
  const key = await webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return webcrypto.subtle.exportKey("jwk", key) as Promise<JsonWebKey>;
}

// Wraps `keyToWrap` symmetrically with `wrappingKey`, matching
// cryptoService.encryptKey()'s symmetric-key branch (random 12-byte IV
// prepended to the ciphertext, base64-encoded).
export async function encryptKeyEnvelope(
  keyToWrap: JsonWebKey,
  wrappingKey: JsonWebKey,
): Promise<string> {
  const encrypted = await aesGcmEncrypt(
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(keyToWrap)),
  );
  return encrypted.toString("base64");
}

async function deriveEcdhAesKey(
  privateKey: JsonWebKey,
  publicKey: JsonWebKey,
): Promise<CryptoKey> {
  const priv = await webcrypto.subtle.importKey(
    "jwk",
    privateKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const pub = await webcrypto.subtle.importKey(
    "jwk",
    publicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  return webcrypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    priv,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// Decrypts a self-wrapped (ECDH of a user's own key pair with itself) key
// envelope, matching cryptoService.decryptKey()'s asymmetric branch. Used
// to recover Alice's real settingsKey from her pre-baked static fixtures
// (tests/images/encrypted/alice@imagey.cloud/**), since - unlike Mary and
// Bill - her settingsKey isn't stored directly in testdata.ts.
async function decryptEcdhKeyEnvelope(
  encryptedBase64: string,
  publicKey: JsonWebKey,
  privateKey: JsonWebKey,
): Promise<JsonWebKey> {
  const combined = Buffer.from(encryptedBase64, "base64");
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const derivedKey = await deriveEcdhAesKey(privateKey, publicKey);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    derivedKey,
    ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// Wraps `keyToWrap` via ECDH (deriveKey(senderPrivateKey,
// recipientPublicKey), then AES-GCM with a random 12-byte IV prepended,
// base64-encoded) - matches cryptoService.encryptKey()'s asymmetric
// branch. Used both for accepting a contact request (the chat key shared
// with the inviter - see ContactService.acceptContactRequest's
// `sharedKeyForInviter`) and for the non-owner branch of
// ContactService.loadChatKey (opening a chat someone else created).
export async function encryptKeyEnvelopeEcdh(
  keyToWrap: JsonWebKey,
  senderPrivateKey: JsonWebKey,
  recipientPublicKey: JsonWebKey,
): Promise<string> {
  const derivedKey = await deriveEcdhAesKey(
    senderPrivateKey,
    recipientPublicKey,
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    new TextEncoder().encode(JSON.stringify(keyToWrap)),
  );
  return Buffer.concat([Buffer.from(iv), Buffer.from(encrypted)]).toString(
    "base64",
  );
}

let alicesSettingsPromise:
  | Promise<{ settingsKey: JsonWebKey; chatsId: string }>
  | undefined;

// Alice's settings document is a pre-baked static fixture (unlike Mary's
// and Bill's, whose settingsKey is known upfront in testdata.ts), so her
// real chats-document id and settingsKey have to be recovered by actually
// decrypting that fixture once, using her main key pair.
function getAlicesSettings(): Promise<{
  settingsKey: JsonWebKey;
  chatsId: string;
}> {
  if (!alicesSettingsPromise) {
    alicesSettingsPromise = (async () => {
      const keyEnvelope = JSON.parse(
        fs.readFileSync(
          "tests/images/encrypted/10ad1cce-816b-4e12-b94d-7ef824c0d162/keys/0.json",
          "utf-8",
        ),
      );
      const settingsKey = await decryptEcdhKeyEnvelope(
        keyEnvelope.sharedKey,
        TestData.alice.publicMainKey,
        TestData.alice.privateMainKey!,
      );
      const encryptedSettingsDocument = fs.readFileSync(
        "tests/images/encrypted/10ad1cce-816b-4e12-b94d-7ef824c0d162/document.enc",
      );
      const decrypted = await aesGcmDecrypt(
        settingsKey,
        encryptedSettingsDocument,
      );
      const payload = JSON.parse(new TextDecoder().decode(decrypted));
      return { settingsKey, chatsId: payload.chats };
    })();
  }
  return alicesSettingsPromise;
}

// Registers a GET for a user's "chats" document (content + key), encrypted
// on the fly with a freshly generated (or caller-supplied) Document key
// wrapped under `settingsKey` - the same shape documentService.loadDocument
// (user, id, user, settingsKey) resolves for any other top-level document
// (see prepareMarysEmptyProfile for the analogous profile case). Returns
// the chats Document's own key so callers can reuse it - e.g. to wrap a
// chat Document's key for its owner (see mockChatDocument below).
async function mockChatsDocument(
  email: string,
  chatsId: string,
  settingsKey: JsonWebKey,
  contacts: { userId: string; chatId: string; owner: string }[],
  given?: string | string[],
  chatsDocumentKey?: JsonWebKey,
): Promise<JsonWebKey> {
  const givenStates = given === undefined ? [] : ([] as string[]).concat(given);
  const key = chatsDocumentKey ?? (await generateAesGcmKeyJwk());
  const content = await aesGcmEncrypt(
    key,
    new TextEncoder().encode(
      JSON.stringify({ contacts, type: "folder", name: "Chats" }),
    ),
  );
  const wrappedKey = await encryptKeyEnvelope(key, settingsKey);

  let contentBuilder = provider.addInteraction();
  for (const state of givenStates) contentBuilder = contentBuilder.given(state);
  contentBuilder
    .uponReceiving(`a request of ${email} to get the chats document`)
    .withRequest("GET", `/users/${email}/documents/${chatsId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) => r.body("application/octet-stream", content));

  let keyBuilder = provider.addInteraction();
  for (const state of givenStates) keyBuilder = keyBuilder.given(state);
  keyBuilder
    .uponReceiving(`a request of ${email} to get the chats document key`)
    .withRequest(
      "GET",
      `/users/${email}/documents/${chatsId}/keys/${email}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      // ADR 0009: the server no longer discloses issuer / kid.
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedKey) }),
    );

  return key;
}

export async function prepareMarysChatsDocument(
  contacts: { userId: string; chatId: string; owner: string }[] = [],
  given?: string | string[],
  chatsDocumentKey?: JsonWebKey,
): Promise<JsonWebKey> {
  return mockChatsDocument(
    "d20cf443-4f96-418f-a957-c8cbef8677c3",
    TestData.mary.settings!.chats,
    TestData.mary.settingsKey!,
    contacts,
    given,
    chatsDocumentKey,
  );
}

export async function prepareBillsChatsDocument(
  contacts: { userId: string; chatId: string; owner: string }[] = [],
  given?: string | string[],
  chatsDocumentKey?: JsonWebKey,
): Promise<JsonWebKey> {
  return mockChatsDocument(
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
    TestData.bill.settings!.chats,
    TestData.bill.settingsKey!,
    contacts,
    given,
    chatsDocumentKey,
  );
}

export async function prepareAlicesChatsDocument(
  contacts: { userId: string; chatId: string; owner: string }[] = [],
  given?: string,
  chatsDocumentKey?: JsonWebKey,
): Promise<JsonWebKey> {
  const { settingsKey, chatsId } = await getAlicesSettings();
  return mockChatsDocument(
    "10ad1cce-816b-4e12-b94d-7ef824c0d162",
    chatsId,
    settingsKey,
    contacts,
    given,
    chatsDocumentKey,
  );
}

// Registers a GET for a chat Document's content + key entry, self-owned by
// `ownerEmail` - i.e. as if `ownerEmail` were the one who originally
// accepted the contact request and created the chat (see ContactService.
// acceptContactRequest): its key is wrapped symmetrically under the
// "chats" document's own key, exactly like ContactService.loadChatKey's
// owner branch (kid = chatsId). Most tests in this suite model the chat as
// self-owned by whichever user is under test - simplest, and sufficient to
// exercise the chat UI itself (which doesn't care how the key was
// obtained). See mockChatDocumentSharedViaSync below for the non-owner
// branch.
async function mockChatDocument({
  ownerEmail,
  chatId,
  chatsId,
  chatsDocumentKey,
  given,
  suffix = "",
  chatDocumentKey = KNOWN_CHAT_KEY,
  validKey = true,
}: {
  ownerEmail: string;
  chatId: string;
  chatsId: string;
  chatsDocumentKey: JsonWebKey;
  given?: string | string[];
  suffix?: string;
  chatDocumentKey?: JsonWebKey;
  validKey?: boolean;
}): Promise<ConfiguredInteraction> {
  const givenStates = given === undefined ? [] : ([] as string[]).concat(given);
  const content = await aesGcmEncrypt(
    chatDocumentKey,
    new TextEncoder().encode(
      JSON.stringify({ documentId: chatId, name: "Chat", type: "Chat" }),
    ),
  );

  let contentBuilder = provider.addInteraction();
  for (const state of givenStates) contentBuilder = contentBuilder.given(state);
  contentBuilder
    .uponReceiving(
      `a request of ${ownerEmail} to get the chat document ${chatId}${suffix}`,
    )
    .withRequest("GET", `/users/${ownerEmail}/documents/${chatId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) => r.body("application/octet-stream", content));

  const wrappedKey = validKey
    ? await encryptKeyEnvelope(chatDocumentKey, chatsDocumentKey)
    : "AAAA";

  let keyBuilder = provider.addInteraction();
  for (const state of givenStates) keyBuilder = keyBuilder.given(state);
  return keyBuilder
    .uponReceiving(
      `a request of ${ownerEmail} to get the chat document ${chatId} key${suffix}`,
    )
    .withRequest(
      "GET",
      `/users/${ownerEmail}/documents/${chatId}/keys/${chatsId}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedKey) }),
    );
}

// Registers a GET for a chat Document's content + key entry as seen from
// the NON-owning side of ContactService.loadChatKey (contact.owner !==
// user): the key entry lives under the owner's own document namespace,
// keyed by the viewer's email. The viewer re-wrapped the chat key under
// their OWN chats-document key when confirming receipt of the contact
// (see ContactService.receiveContactRequest); the server synced that entry
// here, with the viewer as issuer. This is what exercises that branch,
// unlike mockChatDocument above.
async function mockChatDocumentSharedViaSync({
  ownerEmail,
  viewerEmail,
  viewerChatsDocumentKey,
  chatId,
  given,
  suffix = "",
  chatDocumentKey,
}: {
  ownerEmail: string;
  viewerEmail: string;
  viewerChatsDocumentKey: JsonWebKey;
  chatId: string;
  given?: string | string[];
  suffix?: string;
  chatDocumentKey: JsonWebKey;
}): Promise<ConfiguredInteraction> {
  const givenStates = given === undefined ? [] : ([] as string[]).concat(given);

  const content = await aesGcmEncrypt(
    chatDocumentKey,
    new TextEncoder().encode(
      JSON.stringify({ documentId: chatId, name: "Chat", type: "Chat" }),
    ),
  );

  let contentBuilder = provider.addInteraction();
  for (const state of givenStates) contentBuilder = contentBuilder.given(state);
  contentBuilder
    .uponReceiving(
      `a request of ${viewerEmail} to get the synced chat document ${chatId}${suffix}`,
    )
    .withRequest("GET", `/users/${ownerEmail}/documents/${chatId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) => r.body("application/octet-stream", content));

  const wrappedKey = await encryptKeyEnvelope(
    chatDocumentKey,
    viewerChatsDocumentKey,
  );

  let keyBuilder = provider.addInteraction();
  for (const state of givenStates) keyBuilder = keyBuilder.given(state);
  return keyBuilder
    .uponReceiving(
      `a request of ${viewerEmail} to get the synced chat document ${chatId} key${suffix}`,
    )
    .withRequest(
      "GET",
      `/users/${ownerEmail}/documents/${chatId}/keys/${viewerEmail}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedKey) }),
    );
}

// Mary opens a chat Alice created and shared with her (contact.owner ===
// "alice@imagey.cloud" in Mary's own "chats" document) - the non-owner
// branch of ContactService.loadChatKey, from Mary's side. `chatsDocumentKey`
// must be the same key prepareMarysChatsDocument was given, since Mary's
// synced copy of the chat key is wrapped under it.
export async function prepareMarysChatOwnedByAlice(
  chatId: string,
  chatsDocumentKey: JsonWebKey,
  given: string | string[] = "Alice owns a chat shared with mary",
  chatDocumentKey?: JsonWebKey,
): Promise<JsonWebKey> {
  const key = chatDocumentKey ?? (await generateAesGcmKeyJwk());
  await mockChatDocumentSharedViaSync({
    ownerEmail: "10ad1cce-816b-4e12-b94d-7ef824c0d162",
    viewerEmail: "d20cf443-4f96-418f-a957-c8cbef8677c3",
    viewerChatsDocumentKey: chatsDocumentKey,
    chatId,
    given,
    chatDocumentKey: key,
  });
  return key;
}

// Accepting a contact request now also creates the chat's own Document (see
// ContactService.acceptContactRequest) via the same generic multipart
// upload every other document/folder creation uses - mirrors
// prepareMarysFolderCreation() below.
export async function prepareMarysChatCreation() {
  return provider
    .addInteraction()
    .uponReceiving("a request of mary to create a chat document")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/new-chat-id",
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
      }),
    );
}
// --- end Chats-as-a-Document test helpers ----------------------------------

type ConfiguredInteraction = ReturnType<
  ReturnType<
    ReturnType<
      ReturnType<PactV4["addInteraction"]>["uponReceiving"]
    >["withRequest"]
  >["willRespondWith"]
>;

type MockServer = Parameters<
  Parameters<ConfiguredInteraction["executeTest"]>[0]
>[0];

export * from "./testdata";

export const provider = new PactV4({
  dir: process.env.PWD + "/target/test-classes", // prepare for maven packaging
  consumer: "imagey-web",
  provider: "imagey-server",
});

export async function clearLocalStorage(page: Page) {
  // Navigate to an empty HTML page on the same origin to clear storage/IndexedDB without opaque origin restrictions
  await page.goto("/index.html?empty");
  await page.evaluate(() => localStorage.removeItem("imagey.user"));
  await page.evaluate(() =>
    localStorage.removeItem(
      "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
    ),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.deviceIds[bob@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.deviceIds[chris@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem(
      "imagey.deviceIds[10ad1cce-816b-4e12-b94d-7ef824c0d162]",
    ),
  );
  await page.evaluate(() =>
    localStorage.removeItem(
      "imagey.deviceIds[a358c2ed-07d4-4a25-a7db-d860d5c0b895]",
    ),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.devices[1234].key"),
  );
}

export async function loginAsMary(page: Page) {
  await page.goto("/");
  await inputMarysPassword(page);
}

export async function loginAsBill(page: Page) {
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.bill.password);
  await optOutOfKeepLoggedIn(page);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}

export let runningPactRequests = 0;
export let expectedUploadDocumentId = "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb";
export let expectedUploadSmallImageId: string | undefined = undefined;
export let expectedUploadPreviewImageId: string | undefined = undefined;

export async function setupMockServer(page: Page, mockServer: MockServer) {
  const mockServerUrl = new URL(mockServer.url);

  // Matches "/users/..." (the vast majority of endpoints) AND the bare
  // "/users" registration endpoint (no trailing slash) - the old
  // registration endpoint was "/users/" (trailing slash, matched the old
  // stricter pattern), the new one is "/users" with the payload as
  // multipart/form-data, so the pattern needs to allow an empty tail too.
  // "/invitations/<token>" is the emailed registration link the browser
  // follows (a 302 back into the SPA, see InvitationFilter) - it is a real
  // provider interaction too, so route it through the Pact mock as well.
  await page.route(
    /^.*\/(users(\/.*)?|invitations\/[^/?]+)(\?.*)?$/,
    async (route, request) => {
      runningPactRequests++;
      console.log(`Intercepted ${request.method()} ${request.url()}`);

      try {
        const requestUrl = new URL(request.url());
        requestUrl.port = mockServerUrl.port;
        requestUrl.hostname = mockServerUrl.hostname;
        requestUrl.protocol = mockServerUrl.protocol;

        const postData: Buffer | null = request.postDataBuffer();
        const headers = request.headers();

        if (
          request.method() === "GET" &&
          requestUrl.pathname ===
            "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/profile"
        ) {
          await route.fulfill({ status: 404 });
          return;
        }

        const response = await route.fetch({
          url: requestUrl.href,
          method: request.method(),
          headers: headers,
          postData: postData,
          // The invitation link responds 302 back into the SPA - hand that
          // redirect to the browser to follow (so the SPA sees the ?email /
          // ?inviter params) instead of following it here.
          maxRedirects: requestUrl.pathname.startsWith("/invitations/")
            ? 0
            : undefined,
        });

        await route.fulfill({ response });
      } finally {
        runningPactRequests--;
      }
    },
  );
}

// Registers the interactions for fetching Mary's settings document (her
// own document, keyed by her own email as documentId) and its key. Split
// out from prepareMarysLogin() because a few flows reach the "fully logged
// in" app state (which always fetches settings once keys are available,
// see App.tsx) without going through prepareMarysLogin() - e.g. a test
// that registers/unlocks a brand new device from scratch.
export async function prepareMarysSettingsDocument() {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get settings document")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/d20cf443-4f96-418f-a957-c8cbef8677c3",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/d20cf443-4f96-418f-a957-c8cbef8677c3/document.enc",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get settings key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/d20cf443-4f96-418f-a957-c8cbef8677c3/keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/d20cf443-4f96-418f-a957-c8cbef8677c3/keys/0.json",
      ),
    );
}

export async function prepareMarysLogin(
  page: Page,
  storeEmail: boolean = true,
) {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public device key")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get encrypted private main key for device",
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[0].encryptedPrivateMainKey,
      }),
    );
  await prepareMarysSettingsDocument();

  await setupMarysDevice(page, storeEmail);
}

export async function prepareBillsLogin(page: Page) {
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get public key")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.bill.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get public device key")
    .withRequest(
      "GET",
      `/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/devices/${TestData.bill.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.bill.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of bill to get encrypted private main key for device",
    )
    .withRequest(
      "GET",
      `/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/devices/${TestData.bill.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.bill.devices[0].deviceId,
        key: TestData.bill.devices[0].encryptedPrivateMainKey,
      }),
    );
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get settings document")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/a358c2ed-07d4-4a25-a7db-d860d5c0b895/document.enc",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get settings key")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/a358c2ed-07d4-4a25-a7db-d860d5c0b895/keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/a358c2ed-07d4-4a25-a7db-d860d5c0b895/keys/0.json",
      ),
    );
  await setupBillsDevice(page);
}

export async function prepareMarysDocuments() {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get document root")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/68980188-577d-4d2f-9e36-a6b32b25cd3a",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/68980188-577d-4d2f-9e36-a6b32b25cd3a/document.enc",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get document root key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/68980188-577d-4d2f-9e36-a6b32b25cd3a/keys/d20cf443-4f96-418f-a957-c8cbef8677c3",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/68980188-577d-4d2f-9e36-a6b32b25cd3a/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get document f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/document.enc",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get document key for f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a.json",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get content 330e1a82-6626-4a4b-b1ca-9c8a59c859e4 of document f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/files/330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/files/330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get document bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/document.enc",
      ),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get document key for bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a.json",
      ),
    );
  return provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get content 7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0 of document bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0",
      ),
    );
}

// A root folder variant that contains a single sub-folder ("My Vacation")
// instead of the two regular images from prepareMarysDocuments(). The
// sub-folder's own key is wrapped with the root folder's (existing, unchanged)
// key, exactly like any other child document.
export async function prepareMarysDocumentsWithFolder(folderId: string) {
  const rootId = TestData.mary.documents[0].documentId;

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get document root containing a folder")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${rootId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${rootId}/document-with-folder.enc`,
      ),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get document root key for folder test")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${rootId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        `tests/images/encrypted/${rootId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json`,
      ),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get the My Vacation folder")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${folderId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${folderId}/document.enc`,
      ),
    );

  return provider
    .addInteraction()
    .uponReceiving("a request of mary to get the My Vacation folder key")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${folderId}/keys/${rootId}`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        `tests/images/encrypted/${folderId}/keys/${rootId}.json`,
      ),
    );
}

// A root folder variant with no children at all, used when a test wants to
// create the very first folder from a clean slate.
export async function prepareMarysEmptyDocumentsFolder() {
  const rootId = TestData.mary.documents[0].documentId;

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get an empty document root")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${rootId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${rootId}/document-empty-folder.enc`,
      ),
    );

  return provider
    .addInteraction()
    .uponReceiving("a request of mary to get empty document root key")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${rootId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        `tests/images/encrypted/${rootId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json`,
      ),
    );
}

// Creating a folder is just storeDocument() with a zero-byte "Folder" typed
// file: one multipart POST (parent-folder update + new folder metadata + key,
// all in one request) - there's no separate PUT for the parent anymore, and
// since FolderImageComponent never fetches file content for folder-type
// documents, no content GET follows either.
export async function prepareMarysFolderCreation() {
  return provider
    .addInteraction()
    .uponReceiving("a request of mary to create a folder")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/new-folder-id",
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
      }),
    );
}

// Mary's profile is now loaded like any other document: a document.enc encrypted
// with the profile document's own key, plus a keys/mary@imagey.cloud.json holding
// that key wrapped with Mary's settingsKey (documentService.loadDocument(user, id,
// user, settingsKey)). The profile picture is a file attached to the same
// document (documentService.loadContent(user, id, profile.key, profilePictureId)),
// not a separate document.
// A registered interaction is only ever matched once by Pact's mock
// server - a test that genuinely revisits the profile page (and so
// re-fetches it) must register it again with a distinct suffix so each
// visit gets its own expected interaction.
export async function prepareMarysEmptyProfile(suffix: string = "") {
  const profileId = TestData.mary.settings!.profile;

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get her empty profile document" + suffix,
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${profileId}/document-empty.enc`,
      ),
    );

  return provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get her empty profile document key" + suffix,
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        `tests/images/encrypted/${profileId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3-empty.json`,
      ),
    );
}

export async function prepareMarysProfile() {
  const profileId = TestData.mary.settings!.profile;
  const pictureContentId = TestData.mary.documents[5].contentId!;

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her profile document")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${profileId}/document.enc`,
      ),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her profile document key")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        `tests/images/encrypted/${profileId}/keys/d20cf443-4f96-418f-a957-c8cbef8677c3.json`,
      ),
    );

  return provider
    .addInteraction()
    .given("Mary has a profile picture")
    .uponReceiving("a request of mary to get her profile picture content")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}/files/${pictureContentId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${profileId}/files/${pictureContentId}`,
      ),
    );
}

export async function prepareProfileSave() {
  const profileId = TestData.mary.settings!.profile;

  provider
    .addInteraction()
    .uponReceiving("a request of mary to store a new profile picture")
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}/files/.+`,
        generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}/files/00000000-0000-0000-0000-000000000000`,
      }),
      (r) =>
        r.headers({
          "Content-Type": "application/octet-stream",
        }),
    )
    .willRespondWith(200);

  return (
    provider
      .addInteraction()
      .uponReceiving("a request of mary to update her profile metadata")
      .withRequest(
        "PUT",
        `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}`,
        (r) =>
          r.headers({
            "Content-Type": "application/octet-stream",
          }),
      )
      // No body, so 204 No Content - but the server returns the document's new
      // ETag header so a follow-up save in the same session can send a fresh
      // If-Match instead of the now-stale one.
      .willRespondWith(204, (r) =>
        r.headers({ ETag: MatchersV3.string('"updated-profile-etag"') }),
      )
  );
}

// Like prepareProfileSave, but for a save that doesn't touch the picture (no
// files/.+ PUT registered) - a genuine "name only" ProfileSaveButton save
// would otherwise leave that interaction unconsumed.
export function prepareProfileMetadataSave(): ConfiguredInteraction {
  const profileId = TestData.mary.settings!.profile;
  return provider
    .addInteraction()
    .uponReceiving("a request of mary to update her profile metadata only")
    .withRequest(
      "PUT",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${profileId}`,
      (r) =>
        r.headers({
          "Content-Type": "application/octet-stream",
        }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"updated-profile-etag"') }),
    );
}

// --- public-profile test helpers (docs/plans/chat-public-profile.md) ------

// Registers GET <content> + GET <key> for a document owned by `ownerEmail`,
// whose key entry is filed under `kid` and wrapped with `wrappingKey` -
// generic version of mockChatsDocument above, used to mock the private
// Profile and public-profile documents live-encrypted the same way.
async function mockOwnedDocument(
  ownerEmail: string,
  documentId: string,
  kid: string,
  wrappingKey: JsonWebKey,
  documentKey: JsonWebKey,
  content: Record<string, unknown>,
  given: string | string[] | undefined,
  descriptionSuffix: string,
  // The key entry's issuer: for an owner's own key (self-wrap under the
  // user's own id, or under a parent document's id - see
  // publicProfileService's kid=profileId pattern), that's ownerEmail
  // regardless of what kid is. Only a cross-owner share (documentService.
  // shareDocument) sets issuer to the grantee, which happens to equal kid
  // there - defaulting to ownerEmail keeps every existing self-wrap caller
  // correct without having to pass this explicitly.
  issuer: string = ownerEmail,
): Promise<void> {
  // Every document this mocks is generated at test-run time (fixed or
  // dynamic id alike) rather than living in imagey-server's static test
  // fixtures, so ContractTest needs the generic "a document exists" state
  // (see ContractTest.aDocumentExists) to create a matching one - on top of
  // whichever caller-specific state(s) set up the rest of that scenario.
  const givenStates = given === undefined ? [] : ([] as string[]).concat(given);
  const documentExistsParams = { ownerId: ownerEmail, documentId, kid, issuer };
  const encryptedContent = await aesGcmEncrypt(
    documentKey,
    new TextEncoder().encode(JSON.stringify(content)),
  );
  const wrappedKey = await encryptKeyEnvelope(documentKey, wrappingKey);

  let contentBuilder = provider
    .addInteraction()
    .given("a document exists", documentExistsParams);
  for (const state of givenStates) contentBuilder = contentBuilder.given(state);
  contentBuilder
    .uponReceiving(
      `a request of ${ownerEmail} to get document ${documentId}${descriptionSuffix}`,
    )
    .withRequest("GET", `/users/${ownerEmail}/documents/${documentId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", encryptedContent),
    );

  let keyBuilder = provider
    .addInteraction()
    .given("a document exists", documentExistsParams);
  for (const state of givenStates) keyBuilder = keyBuilder.given(state);
  keyBuilder
    .uponReceiving(
      `a request of ${ownerEmail} to get document ${documentId} key ${kid}${descriptionSuffix}`,
    )
    .withRequest(
      "GET",
      `/users/${ownerEmail}/documents/${documentId}/keys/${kid}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedKey) }),
    );
}

// Mary already has a named public profile (§3.5/§3.6): mocks her private
// Profile document (with publicProfileId set) and her own copy of the
// public-profile document, so publicProfileService.ensurePublicProfile
// resolves without creating anything or prompting for a name. Returns the
// public-profile's id/key so a caller can also mock sharing it into a chat
// (see prepareMarysPublicProfileShare below) or reading it back as a
// contact's profile.
// Counter folded into both each call's interaction descriptions AND its
// publicProfileId below: within one test file, several tests calling this
// helper with its default arguments would otherwise register interactions
// that are not just identically described but identical in method+path -
// the mock server has been observed to occasionally misattribute a request
// to an earlier (already-consumed) test's interaction of the same shape
// rather than the current test's freshly registered one. A distinct id per
// call sidesteps that instead of relying on the description alone.
let namedPublicProfileCallCount = 0;

export async function prepareMarysNamedPublicProfile(
  name: string = "Mary",
  given?: string | string[],
): Promise<{ publicProfileId: string; publicProfileKey: JsonWebKey }> {
  const profileId = TestData.mary.settings!.profile;
  const profileKey = TestData.mary.documents[5].key!;
  const callIndex = ++namedPublicProfileCallCount;
  const publicProfileId =
    "22222222-2222-2222-2222-" + String(callIndex).padStart(12, "0");
  const publicProfileKey = await generateAesGcmKeyJwk();
  const callSuffix = ` #${callIndex}`;

  await mockOwnedDocument(
    "d20cf443-4f96-418f-a957-c8cbef8677c3",
    profileId,
    "d20cf443-4f96-418f-a957-c8cbef8677c3",
    TestData.mary.settingsKey!,
    profileKey,
    { emails: ["mary@imagey.cloud"], publicProfileId },
    given,
    ` (named public profile)${callSuffix}`,
  );
  await mockOwnedDocument(
    "d20cf443-4f96-418f-a957-c8cbef8677c3",
    publicProfileId,
    profileId,
    profileKey,
    publicProfileKey,
    { type: "public-profile", name },
    given,
    callSuffix,
  );

  return { publicProfileId, publicProfileKey };
}

// Mary's private Profile document exists but has no publicProfileId yet (no
// public profile at all) - the state ensurePublicProfile's create path
// starts from (§3.5).
export async function prepareMarysProfileWithoutPublicProfile(
  given?: string | string[],
): Promise<void> {
  const profileId = TestData.mary.settings!.profile;
  const profileKey = TestData.mary.documents[5].key!;
  await mockOwnedDocument(
    "d20cf443-4f96-418f-a957-c8cbef8677c3",
    profileId,
    "d20cf443-4f96-418f-a957-c8cbef8677c3",
    TestData.mary.settingsKey!,
    profileKey,
    { emails: ["mary@imagey.cloud"] },
    given,
    " (no public profile yet)",
  );
}

// Registers the multipart POST that creates mary's public profile for the
// first time (§3.5/§10) - analogous to prepareMarysChatCreation for a chat
// Document, just under mary's own tree instead of a "chats" folder. The
// created document's id is client-generated (see publicProfileService.
// createPublicProfile), so the Location header value is only loosely matched.
export async function prepareMarysPublicProfileCreation(): Promise<void> {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to create her public profile")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/new-public-profile-id",
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
        ETag: MatchersV3.string('"new-public-profile-etag"'),
      }),
    );
}

// Registers a PUT to mary's public profile - its avatar file
// (publicProfileService.setAvatar's storeContent) or its metadata
// (setAvatar/setName's updateDocumentMetadata) - matched by a path regex
// since the target document id is client-generated/not known ahead of time
// (see prepareMarysPublicProfileCreation), excluding mary's known documents
// so it can't ambiguously match one of those instead.
export function prepareMarysPublicProfileAvatarPut(
  descriptionSuffix: string = "",
): void {
  provider
    .addInteraction()
    .uponReceiving(
      `a request of mary to store her public profile avatar${descriptionSuffix}`,
    )
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/(?!9b71fa98).+/files/.+",
        generate:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/22222222-2222-2222-2222-222222222222/files/00000000-0000-0000-0000-000000000000",
      }),
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(200);
}

export function prepareMarysPublicProfileMetadataPut(
  descriptionSuffix: string = "",
): void {
  provider
    .addInteraction()
    .uponReceiving(
      `a request of mary to update her public profile metadata${descriptionSuffix}`,
    )
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/(?!9b71fa98)[^/]+$",
        generate:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/22222222-2222-2222-2222-222222222222",
      }),
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"public-profile-etag"') }),
    );
}

// Registers the POST that shares Mary's public profile into a chat with
// `contactUserId` (documentService.shareDocument, called from
// ContactService.acceptContactRequest/receiveContactRequest - see §3.2).
export function prepareMarysPublicProfileShare(
  publicProfileId: string,
  contactUserId: string,
  given?: string | string[],
): ConfiguredInteraction {
  const givenStates = given === undefined ? [] : ([] as string[]).concat(given);
  let builder = provider.addInteraction();
  for (const state of givenStates) builder = builder.given(state);
  return builder
    .uponReceiving(
      `a request of mary to share her public profile with ${contactUserId}`,
    )
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${publicProfileId}/keys`,
      (r) => {
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          issuer: contactUserId,
          kid: contactUserId,
          sharedKey: MatchersV3.string("dummy-shared-key"),
        });
      },
    )
    .willRespondWith(200);
}

// Same as prepareMarysPublicProfileShare, for when mary's public profile was
// just created in the same test (its id is client-generated, so the target
// path is matched with a regex instead of an exact value - same reasoning as
// prepareMarysPublicProfileAvatarPut/MetadataPut above).
export function prepareMarysPublicProfileShareForFreshProfile(
  contactUserId: string,
  given?: string | string[],
): void {
  const givenStates = given === undefined ? [] : ([] as string[]).concat(given);
  let builder = provider.addInteraction();
  for (const state of givenStates) builder = builder.given(state);
  builder
    .uponReceiving(
      `a request of mary to share her freshly created public profile with ${contactUserId}`,
    )
    .withRequest(
      "POST",
      Matchers.regex({
        matcher: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/(?!${TestData.mary.settings!.profile}).+/keys$`,
        generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/22222222-2222-2222-2222-222222222222/keys`,
      }),
      (r) => {
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          issuer: contactUserId,
          kid: contactUserId,
          sharedKey: MatchersV3.string("dummy-shared-key"),
        });
      },
    )
    .willRespondWith(200);
}

export async function prepareDocumentUpload(documentId: string) {
  expectedUploadDocumentId = documentId;

  // For 945331a6-b9a8-4f88-a5f5-5928bcdf2fdb (child-355176_1920.jpg, documents[3])
  // preview: 9e4742c8-b3b8-44b9-ab83-8e4912271dee, small: d09630e2-437e-40ff-8da1-753a0e05caad
  // For 78d1b093-45ec-4a25-9594-615ca2d70ba2 (beach-4524911_480.jpg, documents[4])
  // preview: 2211b759-744c-40f3-aec2-10c8d549a49e, small: 01e9b15b-655c-4baf-8fd3-78c23df70a67
  // For f9910aa7-4db6-4b02-b596-c3ccf872ae98 (beach-4524911_1920.jpg, documents[1])
  // preview: 330e1a82-6626-4a4b-b1ca-9c8a59c859e4, small: f9910aa7-4db6-4b02-b596-c3ccf872ae98

  let previewImageId: string;
  let smallImageId: string;

  if (documentId === TestData.mary.documents[3].documentId) {
    previewImageId = "9e4742c8-b3b8-44b9-ab83-8e4912271dee";
    smallImageId = "d09630e2-437e-40ff-8da1-753a0e05caad";
  } else if (documentId === TestData.mary.documents[1].documentId) {
    previewImageId = "330e1a82-6626-4a4b-b1ca-9c8a59c859e4";
    smallImageId = "f9910aa7-4db6-4b02-b596-c3ccf872ae98";
  } else if (documentId === TestData.mary.documents[4].documentId) {
    previewImageId = "2211b759-744c-40f3-aec2-10c8d549a49e";
    smallImageId = "01e9b15b-655c-4baf-8fd3-78c23df70a67";
  } else {
    // Fallback for other documents
    previewImageId = "9e4742c8-b3b8-44b9-ab83-8e4912271dee";
    smallImageId = "d09630e2-437e-40ff-8da1-753a0e05caad";
  }

  expectedUploadSmallImageId = smallImageId;
  expectedUploadPreviewImageId = previewImageId;

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  provider
    .addInteraction()
    // No provider state needed: the backend generates the documentId itself and the
    // Location header is only loosely matched, so there is nothing to prepare. The id is
    // folded into the description instead, purely so each call site's interaction stays
    // distinct in the merged contract (this function is called with different documentIds
    // from different tests, and the request/response shape would otherwise be identical).
    .uponReceiving(
      `a request of mary to upload a document with id ${documentId}`,
    )
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentId}`,
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
      }),
    );

  return provider
    .addInteraction()
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to load document content of " + documentId,
    )
    .withRequest(
      "GET",
      Matchers.regex({
        matcher:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/(?!(bb66|f991)).+/files/.+",
        generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${documentId}/files/${previewImageId}`,
      }),
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/files/${previewImageId}`,
      ),
    );
}

export async function prepareMarysDevices() {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get devices")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        TestData.mary.devices[1].deviceId,
        TestData.mary.devices[0].deviceId,
      ]),
    );
}

export async function setupMarysDevice(page: Page, storeEmail: boolean = true) {
  await page.evaluate((storeEmail) => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "d20cf443-4f96-418f-a957-c8cbef8677c3");
    if (storeEmail) {
      localStorage.setItem("imagey.email", "mary@imagey.cloud");
    }
  }, storeEmail);
  await page.evaluate(
    (deviceId) =>
      localStorage.setItem(
        "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
        deviceId,
      ),
    TestData.mary.devices[0].deviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
    {
      deviceId: TestData.mary.devices[0].deviceId,
      key: TestData.mary.devices[0].encryptedPrivateDeviceKey,
    },
  );
}

export async function setupMarysSecondDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "d20cf443-4f96-418f-a957-c8cbef8677c3");
    localStorage.setItem("imagey.email", "mary@imagey.cloud");
  });
  await page.evaluate(
    (deviceId) =>
      localStorage.setItem(
        "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
        deviceId,
      ),
    TestData.mary.devices[1].deviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
    {
      deviceId: TestData.mary.devices[1].deviceId,
      key: TestData.mary.devices[1].encryptedPrivateDeviceKey,
    },
  );
}

export async function setupBillsDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "a358c2ed-07d4-4a25-a7db-d860d5c0b895");
    localStorage.setItem("imagey.email", "bill@imagey.cloud");
  });
  await page.evaluate((deviceId) => {
    localStorage.setItem("imagey.devices", JSON.stringify([deviceId]));
    localStorage.setItem("imagey.deviceId", deviceId);
    localStorage.setItem(
      "imagey.deviceIds[a358c2ed-07d4-4a25-a7db-d860d5c0b895]",
      deviceId,
    );
  }, TestData.bill.devices[0].deviceId);
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
    {
      deviceId: TestData.bill.devices[0].deviceId,
      key: TestData.bill.devices[0].encryptedPrivateDeviceKey,
    },
  );
}

// The "keep me logged in" checkbox defaults to on. Tests that only need to
// reach the logged-in app take the lightweight unlock path (no challenge /
// recovery-key round-trip), so they opt out first; the dedicated persistence
// tests tick it back on and register those interactions themselves.
export async function optOutOfKeepLoggedIn(page: Page) {
  const keepLoggedIn = page.getByRole("checkbox", {
    name: "Keep me logged in",
  });
  await expect(keepLoggedIn).toBeVisible();
  await keepLoggedIn.uncheck({ force: true });
  await expect(keepLoggedIn).not.toBeChecked();
}

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.mary.password);
  await optOutOfKeepLoggedIn(page);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}

export async function prepareMarysContactRequests(
  chatsDocumentKey?: JsonWebKey,
) {
  // Accepting a request re-reads the "chats" document a second time (see
  // ContactService.acceptContactRequest) - callers that also exercise the
  // accept flow in the same test must pass the SAME key they used for
  // their own second registration here, otherwise the two independently
  // random keys leave the client's decryption unpredictable depending on
  // which of the two identical-looking interactions the mock server
  // happens to match a given request against.
  await prepareMarysChatsDocument(
    [],
    "mary has no contacts and a contact request from bill",
    chatsDocumentKey,
  );

  return provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to get contact requests")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          inviter: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          invitee: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          publicKey: TestData.bill.publicMainKey,
          status: "INVITED",
          // Bill's own public-profile id, carried on the request (§4) -
          // becomes ContactService.acceptContactRequest's
          // inviterPublicProfileId when mary accepts.
          publicProfileId: "bills-public-profile-id",
        },
      ]),
    );
}

// The inviter's side of the handshake (ContactService.receiveContactRequest,
// via Chats.tsx's second effect): Mary is the inviter, Bill (the invitee)
// already ACCEPTED, and the request now carries Bill's own public key
// (overwritten on accept - see ContactRequest.ts) plus the chat key,
// ECDH-wrapped by Bill for Mary exactly as ContactService.
// acceptContactRequest wraps `sharedKeyForInviter`.
export async function prepareMarysAcceptedContactRequest(
  chatId: string,
  chatDocumentKey: JsonWebKey,
  given: string = "mary has no contacts and bill has accepted marys invitation",
  chatsDocumentKey?: JsonWebKey,
) {
  await prepareMarysChatsDocument([], given, chatsDocumentKey);

  const sharedKey = await encryptKeyEnvelopeEcdh(
    chatDocumentKey,
    TestData.bill.privateMainKey!,
    TestData.mary.publicMainKey,
  );

  return provider
    .addInteraction()
    .given(given)
    .uponReceiving(
      "a request of mary to get an accepted contact request from bill",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          inviter: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          invitee: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          publicKey: TestData.bill.publicMainKey,
          status: "ACCEPTED",
          chatId,
          // ECDH-wrapped, so the concrete bytes differ every run - the provider
          // fixture carries its own; only the shape matters for the contract.
          sharedKey: MatchersV3.string(sharedKey),
        },
      ]),
    );
}

export async function prepareMarysEmptyContactRequests() {
  await prepareMarysChatsDocument([], "mary has no contacts");

  return provider
    .addInteraction()
    .given("mary has no contacts")
    .uponReceiving("a request of mary to get empty contact requests")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
}

export async function prepareBillsEmptyContactRequests() {
  // "no contacts" is bill's default fixture state throughout this suite -
  // unlike mary, he's never given contacts elsewhere, so this needs no
  // explicit provider state (see prepareMarysEmptyContactRequests for the
  // contrasting case, where mary's "no contacts" state IS meaningful
  // because other scenarios give her contacts).
  await prepareBillsChatsDocument([]);

  return provider
    .addInteraction()
    .uponReceiving("a request of bill to get empty contact requests")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
}

export async function prepareBillsDocuments() {
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get document root")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/31e3569a-d2a7-493d-8d45-06370ebd2705",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/31e3569a-d2a7-493d-8d45-06370ebd2705/document.enc",
      ),
    );
  return provider
    .addInteraction()
    .uponReceiving("a request of bill to get document root key")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/31e3569a-d2a7-493d-8d45-06370ebd2705/keys/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/31e3569a-d2a7-493d-8d45-06370ebd2705/keys/a358c2ed-07d4-4a25-a7db-d860d5c0b895.json",
      ),
    );
}

export async function prepareMarysChat(
  contactEmail: string,
  suffix: string = "",
  validKey: boolean = true,
) {
  const chatId = "chat-" + shortName(contactEmail);
  const given =
    contactEmail !== LAURA_ID
      ? `Mary has a chat with ${shortName(contactEmail)}`
      : undefined;

  // Mary already has both laura and alice as contacts (see the fixed
  // chatId's below); the actually-visited `contactEmail` is always one of
  // them, so returning both regardless of which one is under test matches
  // what a real "chats" document would contain.
  const chatsDocumentKey = await prepareMarysChatsDocument(
    [
      {
        userId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
        chatId: "chat-laura",
        owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
      },
      {
        userId: "10ad1cce-816b-4e12-b94d-7ef824c0d162",
        chatId: "chat-alice",
        owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
      },
    ],
    given,
  );

  await mockChatDocument({
    ownerEmail: "d20cf443-4f96-418f-a957-c8cbef8677c3",
    chatId,
    chatsId: TestData.mary.settings!.chats,
    chatsDocumentKey,
    given,
    suffix,
    validKey,
  });

  let builder = provider.addInteraction();
  if (given) {
    builder = builder.given(given);
  }

  return builder
    .uponReceiving(`a request of mary to get contact requests in chat${suffix}`)
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => {
        r.headers({ Accept: "application/json" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
}

// Mary has a chat with `contactUserId` whose metadata carries both parties'
// public-profile ids (§3.3), and the contact has actually shared their public
// profile into it (§3.2) - the read path useContactProfile/
// publicProfileService.loadContactProfile exercises when a chat header
// actually shows a contact's name/avatar, rather than falling back to their
// userId. Unlike prepareMarysChat, this mocks a single, dedicated chat/contact
// rather than mary's two standing contacts.
// Counter folded into every interaction description (and the public-profile
// ids) below - see prepareMarysNamedPublicProfile's comment: several tests
// calling this helper for the same contact would otherwise register
// interactions that are not just identically described but identical in
// method+path, which the mock server has been observed to occasionally
// misattribute across tests.
let chatWithContactProfileCallCount = 0;

export async function prepareMarysChatWithContactProfile({
  contactUserId,
  contactName,
  contactAvatarId,
  contactAvatarContent,
  contactProfileUnavailable = false,
}: {
  contactUserId: string;
  contactName: string;
  contactAvatarId?: string;
  contactAvatarContent?: Uint8Array;
  // §3.4's "Fehlerfall": the contact's public-profile document is listed in
  // the chat metadata but is not (yet) actually reachable - e.g. the key
  // entry hasn't been filed for us yet, or the document itself is gone.
  // Mocked here as the content GET 404ing, matching documentService.
  // loadDocument's content-before-key fetch order (so the key GET never
  // happens, and useContactProfile/publicProfileService.loadContactProfile
  // fall back gracefully instead of throwing).
  contactProfileUnavailable?: boolean;
}): Promise<void> {
  const callIndex = ++chatWithContactProfileCallCount;
  const callSuffix = ` #${callIndex}`;
  const chatId = "chat-" + shortName(contactUserId);
  const chatsDocumentKey = await prepareMarysChatsDocument([
    {
      userId: contactUserId,
      chatId,
      owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
    },
  ]);

  const chatDocumentKey = await generateAesGcmKeyJwk();
  const maryPublicProfileId =
    "44444444-4444-4444-4444-" + String(callIndex).padStart(12, "0");
  const contactPublicProfileId =
    "55555555-5555-5555-5555-" + String(callIndex).padStart(12, "0");
  const chatContent = await aesGcmEncrypt(
    chatDocumentKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: chatId,
        name: "Chat",
        type: "Chat",
        publicProfiles: {
          "d20cf443-4f96-418f-a957-c8cbef8677c3": maryPublicProfileId,
          [contactUserId]: contactPublicProfileId,
        },
      }),
    ),
  );
  provider
    .addInteraction()
    .uponReceiving(
      `a request of mary to get the chat document ${chatId} with public profiles${callSuffix}`,
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatId}`,
      (r) => r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", chatContent),
    );

  const wrappedChatKey = await encryptKeyEnvelope(
    chatDocumentKey,
    chatsDocumentKey,
  );
  provider
    .addInteraction()
    .uponReceiving(
      `a request of mary to get the chat document ${chatId} key with public profiles${callSuffix}`,
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/${chatId}/keys/${TestData.mary.settings!.chats}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedChatKey) }),
    );

  if (contactProfileUnavailable) {
    provider
      .addInteraction()
      .uponReceiving(
        `a request of mary to get ${contactUserId}'s unavailable public profile${callSuffix}`,
      )
      .withRequest(
        "GET",
        `/users/${contactUserId}/documents/${contactPublicProfileId}`,
        (r) => r.headers({ Accept: "application/octet-stream" }),
      )
      .willRespondWith(404);
  } else {
    // The contact's own public-profile document, shared into this chat (its
    // key entry for us is filed under our own userId, wrapped with the chat's
    // key - see ContactService.acceptContactRequest/receiveContactRequest).
    const publicProfileKey = await generateAesGcmKeyJwk();
    await mockOwnedDocument(
      contactUserId,
      contactPublicProfileId,
      "d20cf443-4f96-418f-a957-c8cbef8677c3",
      chatDocumentKey,
      publicProfileKey,
      {
        type: "public-profile",
        name: contactName,
        ...(contactAvatarId ? { avatarId: contactAvatarId } : {}),
      },
      undefined,
      ` (contact public profile)${callSuffix}`,
      // This key entry is a cross-owner share (documentService.
      // shareDocument): its issuer is mary, the grantee, not the contact who
      // owns the document - see the mockOwnedDocument issuer param doc.
      "d20cf443-4f96-418f-a957-c8cbef8677c3",
    );

    if (contactAvatarId && contactAvatarContent) {
      const encryptedAvatar = await aesGcmEncrypt(
        publicProfileKey,
        contactAvatarContent,
      );
      provider
        .addInteraction()
        // Same provider state as the profile document above (see
        // ContractTest.aDocumentExists) - each pact interaction gets a fresh
        // copy of the fixture data, so the parent document's key file (for
        // RolesFilter's "member" check) has to be recreated here too, not
        // just the file content.
        .given("a document exists", {
          ownerId: contactUserId,
          documentId: contactPublicProfileId,
          kid: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          issuer: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          fileId: contactAvatarId,
        })
        .uponReceiving(
          `a request of mary to get ${contactUserId}'s avatar${callSuffix}`,
        )
        .withRequest(
          "GET",
          `/users/${contactUserId}/documents/${contactPublicProfileId}/files/${contactAvatarId}`,
          (r) => r.headers({ Accept: "application/octet-stream" }),
        )
        .willRespondWith(200, (r) =>
          r.body("application/octet-stream", encryptedAvatar),
        );
    }
  }

  provider
    .addInteraction()
    .uponReceiving(
      `a request of mary to get contact requests in chat with ${contactUserId}${callSuffix}`,
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
}

export async function setupAlicesDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "10ad1cce-816b-4e12-b94d-7ef824c0d162");
    localStorage.setItem("imagey.email", "alice@imagey.cloud");
  });
  await page.evaluate((deviceId) => {
    localStorage.setItem("imagey.devices", JSON.stringify([deviceId]));
    localStorage.setItem("imagey.deviceId", deviceId);
    localStorage.setItem(
      "imagey.deviceIds[10ad1cce-816b-4e12-b94d-7ef824c0d162]",
      deviceId,
    );
  }, TestData.alice.devices[0].deviceId);
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
    {
      deviceId: TestData.alice.devices[0].deviceId,
      key: TestData.alice.devices[0].encryptedPrivateDeviceKey,
    },
  );
}

export async function loginAsAlice(page: Page) {
  await setupAlicesDevice(page);
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.alice.password);
  await optOutOfKeepLoggedIn(page);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  // ensure login completes
  const homeLink = page.getByRole("link", { name: "Home" }).first();
  await expect(homeLink).toBeVisible();
}

export async function prepareAlicesLogin() {
  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request to get Alices public main key")
    .withRequest(
      "GET",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (builder) =>
      builder.jsonBody(TestData.alice.publicMainKey),
    );

  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request to get Alices public device key")
    .withRequest(
      "GET",
      `/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/devices/${TestData.alice.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (builder) =>
      builder.jsonBody(TestData.alice.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request to get Alices encrypted private device key")
    .withRequest(
      "GET",
      `/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/devices/${TestData.alice.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (builder) =>
      builder.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.alice.devices[0].deviceId,
        key: TestData.alice.devices[0].encryptedPrivateMainKey,
      }),
    );

  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request to get Alices contact requests")
    .withRequest(
      "GET",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/contact-requests",
    )
    .willRespondWith(200, (builder) => builder.jsonBody([]));

  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request to get Alices settings document")
    .withRequest(
      "GET",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/10ad1cce-816b-4e12-b94d-7ef824c0d162",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "tests/images/encrypted/10ad1cce-816b-4e12-b94d-7ef824c0d162/document.enc",
      ),
    );

  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request to get Alices settings key")
    .withRequest(
      "GET",
      "/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/10ad1cce-816b-4e12-b94d-7ef824c0d162/keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        "tests/images/encrypted/10ad1cce-816b-4e12-b94d-7ef824c0d162/keys/0.json",
      ),
    );
}

// Alice, like Mary, has her own (empty) documents root folder that the
// Activities/Home page eagerly loads right after login - independent of
// whatever chat/document-sharing scenario the test is actually about.
export async function prepareAlicesEmptyDocumentsFolder() {
  const rootId = "68980188-577d-4d2f-9e36-a6b32b25cd3a"; // Alice reuses this fixture ID; see prepareAlicesLogin above.

  provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request of alice to get an empty document root")
    .withRequest(
      "GET",
      `/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/${rootId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${rootId}/document-empty-folder.enc`,
      ),
    );

  return provider
    .addInteraction()
    .given("Alice exists")
    .uponReceiving("a request of alice to get empty document root key")
    .withRequest(
      "GET",
      `/users/10ad1cce-816b-4e12-b94d-7ef824c0d162/documents/${rootId}/keys/10ad1cce-816b-4e12-b94d-7ef824c0d162`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/json",
        `tests/images/encrypted/${rootId}/keys/10ad1cce-816b-4e12-b94d-7ef824c0d162.json`,
      ),
    );
}

export async function prepareAlicesChat(
  contact: string,
  suffix: string = "",
  returnValidKey: boolean = true,
) {
  const { chatsId } = await getAlicesSettings();
  const chatId = "chat-" + shortName(contact);

  const chatsDocumentKey = await prepareAlicesChatsDocument(
    [
      {
        userId: contact,
        chatId,
        owner: "10ad1cce-816b-4e12-b94d-7ef824c0d162",
      },
    ],
    "Alice has a chat with mary",
  );

  await mockChatDocument({
    ownerEmail: "10ad1cce-816b-4e12-b94d-7ef824c0d162",
    chatId,
    chatsId,
    chatsDocumentKey,
    given: "Alice has a chat with mary",
    suffix,
    validKey: returnValidKey,
  });

  return provider;
}

export async function prepareBillsDocumentUpload(documentId: string) {
  expectedUploadDocumentId = documentId;
  const previewImageId =
    documentId === TestData.mary.documents[3].documentId
      ? "9e4742c8-b3b8-44b9-ab83-8e4912271dee"
      : "330e1a82-6626-4a4b-b1ca-9c8a59c859e4";

  const smallImageId =
    documentId === TestData.mary.documents[3].documentId
      ? "d09630e2-437e-40ff-8da1-753a0e05caad"
      : "f9910aa7-4db6-4b02-b596-c3ccf872ae98";

  expectedUploadSmallImageId = smallImageId;
  expectedUploadPreviewImageId = previewImageId;

  provider
    .addInteraction()
    .uponReceiving("a request of bill to get public key")
    .withRequest(
      "GET",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.bill.publicMainKey));

  // Mock für den Upload-Request
  provider
    .addInteraction()
    // See the comment on the equivalent mary interaction above: no provider state is
    // needed here either, the id in the description is only there to keep this interaction
    // distinct in the merged contract.
    .uponReceiving(
      `a request of bill to upload a document with id ${documentId}`,
    )
    .withRequest(
      "POST",
      "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          `/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/${documentId}`,
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
      }),
    );

  return provider
    .addInteraction()
    .given("Bill has uploaded document")
    .uponReceiving(
      "a request of bill to load document content of " + documentId,
    )
    .withRequest(
      "GET",
      Matchers.regex({
        matcher:
          "/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/(?!(bb66|f991)).+/files/.+",
        generate: `/users/a358c2ed-07d4-4a25-a7db-d860d5c0b895/documents/${documentId}/files/${previewImageId}`,
      }),
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `tests/images/encrypted/${documentId}/files/${previewImageId}`,
      ),
    );
}

// Registers the fetches App.tsx/ActivityService make right after a FRESH
// registration: the settings document, its key envelope, the (now, per the
// updated registration implementation) already-created empty document-list
// root, and its key envelope. Unlike Mary's fixtures (pre-encrypted offline
// under known, fixed keys), a freshly registered user's settingsKey and
// mainKeyPair are generated randomly IN THE BROWSER during the test run, so
// there is no way to pre-bake matching ciphertext ahead of time. Instead we
// generate a settings key HERE (in Node, using the same AES-GCM algorithm
// the app uses), encrypt real, valid fixtures with it, and return that key
// so the caller's test can install a crypto.subtle.decrypt override (see
// the existing pattern in unlock.test.ts) that intercepts only the ONE
// decrypt the mock server genuinely can't satisfy - the settings key
// envelope itself, which the app decrypts asymmetrically using its
// randomly-generated mainKeyPair - and returns this key instead. Every
// other decrypt in the chain (the document-list key envelope, the settings
// document content, the document-list content) is genuinely, correctly
// encrypted under that same key, so it decrypts for real, no interception
// needed.
export async function prepareFreshUserSettings(email: string) {
  const subtle = webcrypto.subtle;
  const settingsKeyCryptoKey = await subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const settingsKeyJwk = (await subtle.exportKey(
    "jwk",
    settingsKeyCryptoKey,
  )) as JsonWebKey;

  // Freely chosen - the real registration call generates its own random
  // IDs, but the app forgets those and re-derives everything from this
  // mocked settings document instead, so these are the IDs that end up
  // actually being used for the rest of the test.
  const documentListId = "22222222-2222-2222-2222-222222222222";
  const chatListId = "33333333-3333-3333-3333-333333333333";
  const profileId = "44444444-4444-4444-4444-444444444444";

  async function encryptWithSettingsKey(plaintext: string): Promise<Buffer> {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv },
      settingsKeyCryptoKey,
      new TextEncoder().encode(plaintext),
    );
    return Buffer.concat([Buffer.from(iv), Buffer.from(encrypted)]);
  }

  const settingsDocument = await encryptWithSettingsKey(
    JSON.stringify({
      documents: documentListId,
      chats: chatListId,
      profile: profileId,
    }),
  );
  const documentList = await encryptWithSettingsKey(
    JSON.stringify({ documents: [], type: "folder", name: "Documents" }),
  );
  // Contacts/chats are also just a Document now (see mockChatsDocument
  // above) - a freshly registered user starts with an empty contacts list,
  // same shape as the empty document list below.
  const chatList = await encryptWithSettingsKey(
    JSON.stringify({ contacts: [], type: "folder", name: "Chats" }),
  );
  // The document-list/chat-list keys are "self-wrapped" with the settings
  // key (i.e. we reuse the same key as their own key) - one fewer key to
  // generate, and ActivityService only ever needs to decrypt these
  // envelopes with settingsKey, so it doesn't matter that it's the same key.
  const documentListSharedKey = (
    await encryptWithSettingsKey(JSON.stringify(settingsKeyJwk))
  ).toString("base64");
  const chatListSharedKey = documentListSharedKey;

  // Placeholder for the settings key's own envelope - real bytes don't
  // matter here since the test's crypto.subtle.decrypt override intercepts
  // this specific decrypt (see doc comment above), but it must still be
  // valid base64 so base64ToArrayBuffer() doesn't throw before decrypt is
  // even attempted.
  const settingsKeyEnvelope = Buffer.from(
    webcrypto.getRandomValues(new Uint8Array(28)),
  ).toString("base64");

  provider
    .addInteraction()
    // Only meaningful for joe@imagey.cloud (the only caller, right after a fresh
    // registration) - see prepareFreshUserSettings doc comment above.
    .given("Joe is registered")
    .uponReceiving(`a request of ${email} to get settings document`)
    .withRequest("GET", `/users/${email}/documents/${email}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", settingsDocument),
    );

  provider
    .addInteraction()
    // Only meaningful for joe@imagey.cloud (the only caller, right after a fresh
    // registration) - see prepareFreshUserSettings doc comment above.
    .given("Joe is registered")
    .uponReceiving(`a request of ${email} to get settings key`)
    .withRequest("GET", `/users/${email}/documents/${email}/keys/0`, (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(settingsKeyEnvelope) }),
    );

  provider
    .addInteraction()
    // Only meaningful for joe@imagey.cloud (the only caller, right after a fresh
    // registration) - see prepareFreshUserSettings doc comment above.
    .given("Joe is registered")
    .uponReceiving(`a request of ${email} to get fresh document list`)
    .withRequest("GET", `/users/${email}/documents/${documentListId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", documentList),
    );

  provider
    .addInteraction()
    // Only meaningful for joe@imagey.cloud (the only caller, right after a fresh
    // registration) - see prepareFreshUserSettings doc comment above.
    .given("Joe is registered")
    .uponReceiving(`a request of ${email} to get fresh document list key`)
    .withRequest(
      "GET",
      `/users/${email}/documents/${documentListId}/keys/${email}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(documentListSharedKey) }),
    );

  provider
    .addInteraction()
    // Only meaningful for joe@imagey.cloud (the only caller, right after a fresh
    // registration) - see prepareFreshUserSettings doc comment above.
    .given("Joe is registered")
    .uponReceiving(`a request of ${email} to get fresh chat list`)
    .withRequest("GET", `/users/${email}/documents/${chatListId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) => r.body("application/octet-stream", chatList));

  provider
    .addInteraction()
    // Only meaningful for joe@imagey.cloud (the only caller, right after a fresh
    // registration) - see prepareFreshUserSettings doc comment above.
    .given("Joe is registered")
    .uponReceiving(`a request of ${email} to get fresh chat list key`)
    .withRequest(
      "GET",
      `/users/${email}/documents/${chatListId}/keys/${email}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(chatListSharedKey) }),
    );

  return { settingsKeyJwk, documentListId, chatListId, profileId };
}
