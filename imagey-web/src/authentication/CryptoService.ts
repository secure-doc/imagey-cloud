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

  generatePasswordKey: async (
    deviceId: string,
    password: string,
  ): Promise<JsonWebKey> => {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(deviceId),
        iterations: 250_000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    return crypto.subtle.exportKey("jwk", derivedKey) as Promise<JsonWebKey>;
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
    password: string,
  ): Promise<string> => {
    const plaintext = JSON.stringify(privateKey);
    const result = await encryptWithPassword(plaintext, password);
    return result;
  },

  decryptPrivatePasswordKey: async (
    encrypted: string,
    password: string,
  ): Promise<JsonWebKey> => {
    const decrypted = await decryptWithPassword(encrypted, password);
    return JSON.parse(decrypted);
  },

  encryptKey: async (
    keyToEncrypt: JsonWebKey,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<string> => {
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

    const base64 = arrayBufferToBase64(combined.buffer);

    return base64;
  },

  decryptKey: async (
    encryptedBase64: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const combined = base64ToArrayBuffer(encryptedBase64);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const derivedKey = await deriveKey(privateKey, publicKey);
    const decryptedBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      derivedKey,
      ciphertext,
    );
    const text = new TextDecoder().decode(decryptedBytes);
    const keyToDecrypt = JSON.parse(text);
    return keyToDecrypt;
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
};

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
  encryptedBase64: string,
  password: string,
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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return buffer.buffer;
}
