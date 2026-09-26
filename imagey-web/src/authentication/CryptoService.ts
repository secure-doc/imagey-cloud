import { MessageContent } from "../chat/Message.ts";
import { Nonce } from "./AuthenticationService.ts";
import { Password } from "./UserId.ts";

export type EncryptedKey = string;
export type EncryptedContent = string;

export const cryptoService = {
  generateUuid: () => crypto.randomUUID(),

  generateSymmetricKey: async (): Promise<JsonWebKey> => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return crypto.subtle.exportKey("jwk", key) as Promise<JsonWebKey>;
  },

  initializeKeyPair: async (): Promise<{
    privateKey: JsonWebKey;
    publicKey: JsonWebKey;
  }> => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"],
    );
    return {
      privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
      publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    };
  },

  encryptPrivatePasswordKey: async (
    privateKey: JsonWebKey,
    password: Password,
  ): Promise<string> => {
    const plaintext = JSON.stringify(privateKey);
    const result = await encryptWithPassword(plaintext, password);
    return result;
  },

  decryptPrivatePasswordKey: async (
    encrypted: EncryptedKey,
    password: Password,
  ): Promise<JsonWebKey> => {
    const decrypted = await decryptWithPassword(encrypted, password);
    return JSON.parse(decrypted);
  },

  encryptKey: async (
    keyToEncrypt: JsonWebKey,
    publicKeyOrSymmetricKey: JsonWebKey,
    privateKey?: JsonWebKey,
  ): Promise<EncryptedKey> => {
    if (privateKey) {
      const derivedKey = await deriveKey(privateKey, publicKeyOrSymmetricKey);
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

      return arrayBufferToBase64(combined.buffer);
    } else {
      const cryptoKey = await importSymmetricKey(publicKeyOrSymmetricKey);
      const encrypted = await encryptAESGCM(
        new TextEncoder().encode(JSON.stringify(keyToEncrypt))
          .buffer as ArrayBuffer,
        cryptoKey,
      );
      return arrayBufferToBase64(encrypted);
    }
  },

  decryptKey: async (
    encrypted: EncryptedKey,
    publicKeyOrSymmetricKey: JsonWebKey,
    privateKey?: JsonWebKey,
  ): Promise<JsonWebKey> => {
    if (privateKey) {
      const combined = base64ToArrayBuffer(encrypted);
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const derivedKey = await deriveKey(privateKey, publicKeyOrSymmetricKey);
      const decryptedBytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        derivedKey,
        ciphertext,
      );
      const text = new TextDecoder().decode(decryptedBytes);
      const keyToDecrypt = JSON.parse(text);
      return keyToDecrypt;
    } else {
      const cryptoKey = await importSymmetricKey(publicKeyOrSymmetricKey);
      const decryptedKey = await decryptAESGCM(
        base64ToArrayBuffer(encrypted),
        cryptoKey,
      );
      const text = new TextDecoder().decode(decryptedKey);
      return JSON.parse(text);
    }
  },

  // Derives a chat's symmetric key from the two parties' main key pairs
  // (ADR 0015): ECDH of the own private and the other party's public main key,
  // expanded with HKDF-SHA-256 and bound to this chat via `info`. Inviter and
  // invitee compute the same key independently, so it never has to be sent.
  deriveChatKey: async (
    ownPrivateKey: JsonWebKey,
    otherPublicKey: JsonWebKey,
    chatId: string,
    inviterId: string,
    inviteeId: string,
  ): Promise<JsonWebKey> =>
    deriveAgreedKey(ownPrivateKey, otherPublicKey, [
      "imagey-chat-key",
      chatId,
      inviterId,
      inviteeId,
    ]),

  // Derives the key a device's info (name, platform, registration date) is
  // encrypted with (ADR 0017): ECDH of the user's main key pair and the
  // device's key pair, expanded with HKDF-SHA-256 and bound to the device.
  // The device itself computes it from its private device key and the public
  // main key, so it can store its info before it is activated; every activated
  // device computes the same key from the private main key and the device's
  // public key.
  deriveDeviceInfoKey: async (
    ownPrivateKey: JsonWebKey,
    otherPublicKey: JsonWebKey,
    userId: string,
    deviceId: string,
  ): Promise<JsonWebKey> =>
    deriveAgreedKey(ownPrivateKey, otherPublicKey, [
      "imagey-device-info",
      userId,
      deviceId,
    ]),

  // The key the inviter encrypts their own name/email (ContactRequest.
  // contactInfo) with for an INVITED request: the inviter does not know the
  // invitee's public key yet (ADR 0015), but both know the invitee's address
  // and the chatId. Addresses are low-entropy, so this only keeps the info
  // from being stored in plaintext - it is no protection against someone
  // who can guess the address (see docs/adr/0016-contact-info-on-contact-requests.md).
  deriveInvitationKey: async (
    inviteeEmail: string,
    chatId: string,
  ): Promise<JsonWebKey> => {
    const hkdfKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(normalizeEmail(inviteeEmail)),
      "HKDF",
      false,
      ["deriveKey"],
    );
    const invitationKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(
          ["imagey-invitation-key", chatId].join("\u0000"),
        ),
      },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return crypto.subtle.exportKey("jwk", invitationKey);
  },

  encryptDocument: async (
    key: JsonWebKey,
    content: ArrayBuffer[],
  ): Promise<ArrayBuffer[]> => {
    const cryptoKey = await importSymmetricKey(key);
    return Promise.all(content.map((buf) => encryptAESGCM(buf, cryptoKey)));
  },

  decryptDocument: async (
    key: JsonWebKey,
    content: ArrayBuffer,
  ): Promise<ArrayBuffer> => {
    const cryptoKey = await importSymmetricKey(key);
    return decryptAESGCM(content, cryptoKey);
  },

  encryptChallengeNonce: async (
    nonce: Nonce,
    serverPublicKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ): Promise<EncryptedContent> => {
    const derivedKey = await deriveKey(privateDeviceKey, serverPublicKey);
    const plaintext = new TextEncoder().encode(nonce);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      derivedKey,
      plaintext,
    );

    const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.byteLength);

    return arrayBufferToBase64(combined.buffer);
  },
  encryptMessage: async (
    message: MessageContent,
    key: JsonWebKey,
  ): Promise<EncryptedContent> => {
    const cryptoKey = await importSymmetricKey(key);
    const encoded = new TextEncoder().encode(message);
    const encrypted = await encryptAESGCM(
      encoded.buffer as ArrayBuffer,
      cryptoKey,
    );
    return arrayBufferToBase64(encrypted);
  },

  decryptMessage: async (
    encryptedBase64: EncryptedContent,
    key: JsonWebKey,
  ): Promise<MessageContent> => {
    const cryptoKey = await importSymmetricKey(key);
    const encryptedBuffer = base64ToArrayBuffer(encryptedBase64);
    const decryptedBuffer = await decryptAESGCM(encryptedBuffer, cryptoKey);
    return new TextDecoder().decode(decryptedBuffer);
  },

  arrayBufferToBase64,
  base64ToArrayBuffer,
};

// ECDH of the own private and the other party's public key, expanded with
// HKDF-SHA-256 and bound to its purpose via `info`. Both parties compute the
// same key independently, so it never has to be sent.
async function deriveAgreedKey(
  ownPrivateKey: JsonWebKey,
  otherPublicKey: JsonWebKey,
  info: string[],
): Promise<JsonWebKey> {
  // Private keys are exported with key_ops ["deriveKey"]; drop them so the
  // key can be imported for deriveBits.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { key_ops, ...privateKey } = ownPrivateKey;
  const priv = await crypto.subtle.importKey(
    "jwk",
    privateKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const pub = await crypto.subtle.importKey(
    "jwk",
    otherPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: pub },
    priv,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const agreedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info.join("\u0000")),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return crypto.subtle.exportKey("jwk", agreedKey);
}

async function deriveKey(
  privateKey: JsonWebKey,
  publicKey: JsonWebKey,
): Promise<CryptoKey> {
  const priv = await crypto.subtle.importKey(
    "jwk",
    privateKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const pub = await crypto.subtle.importKey(
    "jwk",
    publicKey,
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

async function importSymmetricKey(key: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    key,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encryptAESGCM(
  payload: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    payload,
  );

  // IV vorne anhängen
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return combined.buffer;
}

async function decryptAESGCM(
  payload: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const combined = new Uint8Array(payload);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

async function encryptWithPassword(
  plaintext: string,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(
    salt.byteLength + iv.byteLength + encrypted.byteLength,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);

  return arrayBufferToBase64(combined.buffer);
}

async function decryptWithPassword(
  encryptedBase64: EncryptedKey,
  password: Password,
): Promise<string> {
  const combined = base64ToArrayBuffer(encryptedBase64);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    aesKey,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return buffer.buffer;
}

// Same normalization as the server's Email record (lower case), so an address
// typed with different case by inviter and invitee derives the same key.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
