import { buf2hex, buf2text, hex2buf, text2buf } from "./ConversionService";

export const cryptoService = {
  generateUuid: () => {
    return crypto.randomUUID();
  },
  generateSymmetricKey: async (): Promise<JsonWebKey> => {
    const symmetricKey = await crypto.subtle.generateKey(
      { name: "AES-CTR", length: 256 }, // AES in "counter" mode
      true, // Allow exporting the key
      ["encrypt", "decrypt"],
    );
    return exportKey(symmetricKey);
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
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: text2buf(deviceId),
        iterations: 250000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      true, // allow exporting the key
      ["encrypt", "decrypt"],
    );
    return exportKey(key);
  },

  initializeKeyPair: async (): Promise<{
    privateKey: JsonWebKey;
    publicKey: JsonWebKey;
  }> => {
    const cryptoKeyPair = await createKeyPair();
    const privateKey = await exportKey(cryptoKeyPair.privateKey);
    const publicKey = await exportKey(cryptoKeyPair.publicKey);
    return { privateKey, publicKey };
  },

  encryptPrivatePasswordKey: async (
    privateKey: JsonWebKey,
    password: string,
  ): Promise<string> => {
    return encryptWithPassword(JSON.stringify(privateKey), password);
  },

  decryptPrivatePasswordKey: async (
    encryptedPrivateKey: string,
    password: string,
  ): Promise<JsonWebKey> => {
    const decryptedPrivateKey = await decryptWithPassword(
      encryptedPrivateKey,
      password,
    );
    return JSON.parse(decryptedPrivateKey);
  },

  encryptKey: async (
    keyToEncrypt: JsonWebKey,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<string> => {
    try {
      const derivedKey = await deriveKey(privateKey, publicKey);
      const encodedKeyToEncrypt = text2buf(JSON.stringify(keyToEncrypt));
      const encryptedKey = await encrypt(encodedKeyToEncrypt, derivedKey);
      const hexKey = buf2hex(encryptedKey);
      return hexKey;
    } catch (e) {
      return Promise.reject(e);
    }
  },

  decryptKey: async (
    keyToDecrypt: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const keyBuf = hex2buf(keyToDecrypt);
    const derivedKey = await deriveKey(privateKey, publicKey);
    const decryptedJsonWebKey = await decrypt(keyBuf, derivedKey);
    const decodedJsonWebKey = buf2text(decryptedJsonWebKey);
    return JSON.parse(decodedJsonWebKey);
  },

  encryptDocument: async (
    keyToEncrypt: JsonWebKey,
    content: ArrayBuffer[],
  ): Promise<ArrayBuffer[]> => {
    const cryptoKey = await importSymmetricKey(keyToEncrypt);
    return Promise.all(content.map((buffer) => encrypt(buffer, cryptoKey)));
  },
  decryptDocument: async (
    keyToDecrypt: JsonWebKey,
    content: ArrayBuffer,
  ): Promise<ArrayBuffer> => {
    const cryptoKey = await importSymmetricKey(keyToDecrypt);
    return decrypt(content, cryptoKey);
  },
};

async function exportKey(key: CryptoKey) {
  return crypto.subtle.exportKey("jwk", key) as JsonWebKey;
}

async function createKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
}

const getPasswordKey = (password: string) =>
  window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

const deriveKey = async (privateKey: JsonWebKey, publicKey: JsonWebKey) => {
  const privateCryptoKey = await importPrivateKey(privateKey);
  const publicCryptoKey = await importPublicKey(publicKey);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicCryptoKey },
    privateCryptoKey,

    { name: "AES-CTR", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
};

async function importSymmetricKey(key: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    key,
    { name: "AES-CTR", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function importPrivateKey(key: JsonWebKey) {
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey"],
  );
  return cryptoKey;
}

async function importPublicKey(key: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    key,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    [],
  );
}

const derivePasswordKey = (
  passwordKey: CryptoKey,
  salt: ArrayBuffer,
  keyUsage: KeyUsage[],
) =>
  window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsage,
  );
async function encrypt(payload: ArrayBuffer, key: CryptoKey) {
  return crypto.subtle.encrypt(
    { name: "AES-CTR", counter: new Uint8Array(16), length: 16 * 8 },
    key,
    payload,
  );
}

async function decrypt(payload: ArrayBuffer, key: CryptoKey) {
  return crypto.subtle.decrypt(
    { name: "AES-CTR", counter: new Uint8Array(16), length: 16 * 8 },
    key,
    payload,
  );
}

async function encryptWithPassword(secretData: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passwordKey = await getPasswordKey(password);
  const aesKey = await derivePasswordKey(passwordKey, salt, ["encrypt"]);
  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    new TextEncoder().encode(secretData),
  );

  const encryptedContentArr = new Uint8Array(encryptedContent);
  const buffer = new Uint8Array(
    salt.byteLength + iv.byteLength + encryptedContentArr.byteLength,
  );
  buffer.set(salt, 0);
  buffer.set(iv, salt.byteLength);
  buffer.set(encryptedContentArr, salt.byteLength + iv.byteLength);
  return buf2hex(buffer);
}

async function decryptWithPassword(encryptedData: string, password: string) {
  const encryptedDataBuff = hex2buf(encryptedData);
  const salt = encryptedDataBuff.slice(0, 16);
  const iv = encryptedDataBuff.slice(16, 16 + 12);
  const data = encryptedDataBuff.slice(16 + 12);
  const passwordKey = await getPasswordKey(password);
  const aesKey = await derivePasswordKey(passwordKey, salt, ["decrypt"]);
  const decryptedContent = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    data,
  );
  return new TextDecoder().decode(decryptedContent);
}
