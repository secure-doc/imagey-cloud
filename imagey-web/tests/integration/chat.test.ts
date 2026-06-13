import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  runningPactRequests,
  prepareMarysDocuments,
} from "./setup";
import { webcrypto } from "crypto";

const crypto = webcrypto as unknown as Crypto;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const binary = Buffer.from(buffer).toString("base64");
  return binary;
}

async function deriveKey(privateKey: JsonWebKey, publicKey: JsonWebKey) {
  const priv = await crypto.subtle.importKey(
    "jwk",
    { ...privateKey, key_ops: ["deriveKey", "deriveBits"] },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const pub = await crypto.subtle.importKey(
    "jwk",
    { ...publicKey, key_ops: [] },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    priv,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encryptKey(
  keyToEncrypt: JsonWebKey,
  publicKey: JsonWebKey,
  privateKey: JsonWebKey,
): Promise<string> {
  const derivedKey = await deriveKey(privateKey, publicKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(keyToEncrypt));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    plaintext,
  );

  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);

  return arrayBufferToBase64(combined.buffer as ArrayBuffer);
}

async function encryptMessage(
  message: string,
  key: JsonWebKey,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { ...key, key_ops: ["encrypt", "decrypt"] },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const encoded = new TextEncoder().encode(message);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded,
  );

  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return arrayBufferToBase64(combined.buffer as ArrayBuffer);
}

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("view chat and send message", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysDocuments();

  // Generate a random symmetric key for the chat
  const sharedCryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const sharedKeyJwk = await crypto.subtle.exportKey("jwk", sharedCryptoKey);

  // Encrypt the shared key using Laura's public key and Mary's private key
  const encryptedSharedKey = await encryptKey(
    sharedKeyJwk,
    TestData.laura.publicMainKey,
    TestData.mary.privateMainKey,
  );

  // Encrypt a mock message
  const encryptedReceivedMessage = await encryptMessage(
    "Hello Mary, this is Laura!",
    sharedKeyJwk,
  );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get lauras public key for chat")
    .withRequest("GET", "/users/laura@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.laura.publicMainKey));

  provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request to get shared contact key")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/key",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        invitationKey: MatchersV3.string(encryptedSharedKey),
      }),
    );

  provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request to store the updated key")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/key",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        r.jsonBody({
          key: MatchersV3.like("dummy-key"),
        });
      },
    )
    .willRespondWith(204);

  provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request to receive messages")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          id: MatchersV3.string("msg-123"),
          content: MatchersV3.string(encryptedReceivedMessage),
        },
      ]),
    );

  // Since we use long polling, we might receive a second request for messages.
  // We mock the polling request with a sinceId
  provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request to receive more messages")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
      (r) => {
        r.query({ sinceId: "msg-123" });
      },
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request to send a message")
    .withRequest(
      "POST",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud/messages",
      (r) => {
        r.headers({
          "Content-Type": "text/plain",
        });
      },
    )
    .willRespondWith(200);

  // Mock GET /contacts so Mary sees Laura in the list
  provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request of mary to get contacts in chat")
    .withRequest("GET", "/users/mary@imagey.cloud/contacts", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(["laura@imagey.cloud"]));

  // Mock GET /contact-requests to fulfill Chats.tsx requirements
  const builder = provider
    .addInteraction()
    .given("Mary is chatting with Laura")
    .uponReceiving("a request of mary to get contact requests in chat")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Go to Chats
    await page.getByRole("link", { name: "Chats" }).first().click();

    // Click on Laura's contact
    const lauraContact = page.getByText("laura@imagey.cloud").first();
    await expect(lauraContact).toBeVisible();
    await lauraContact.click();

    // Verify chat UI loaded
    await expect(
      page.getByRole("heading", { name: "laura@imagey.cloud" }),
    ).toBeVisible();

    // Verify received message is decrypted and shown
    await expect(page.getByText("Hello Mary, this is Laura!")).toBeVisible();

    // Send a message
    const input = page.getByPlaceholder("Type a message");
    await input.fill("Hi Laura, nice to chat!");
    await page.getByRole("button", { name: "send" }).click();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
