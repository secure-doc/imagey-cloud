import { buf2hex, buf2text, hex2buf, text2buf } from "./ConversionService";

export const cryptoService = {
  initializeSymmetricKey: async (): Promise<JsonWebKey> => {
    const symmetricKey = await createSymmetricKey();
    const symmetricJsonWebKey = await exportKey(symmetricKey);
    return symmetricJsonWebKey;
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

  encryptPrivateKey: async (
    privateKey: JsonWebKey,
    symmetricKey: JsonWebKey,
  ): Promise<string> => {
    const encodedPrivateKey = text2buf(JSON.stringify(privateKey));
    const symmetricCryptoKey = await importSymmetricKey(symmetricKey);
    const encryptedPrivateKey = await encrypt(
      encodedPrivateKey,
      symmetricCryptoKey,
    );
    return buf2hex(encryptedPrivateKey);
  },

  decryptPrivateKey: async (
    encryptedPrivateKey: string,
    symmetricKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const symmetricCryptoKey = await importSymmetricKey(symmetricKey);
    const decryptedPrivateKey = await decrypt(
      hex2buf(encryptedPrivateKey),
      symmetricCryptoKey,
    );
    return JSON.parse(buf2text(decryptedPrivateKey));
  },
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

async function exportKey(key: CryptoKey) {
  return crypto.subtle.exportKey("jwk", key) as JsonWebKey;
}

async function createSymmetricKey() {
  return crypto.subtle.generateKey(
    { name: "AES-CTR", length: 256 }, // AES in "counter" mode
    true, // Allow exporting the key
    ["encrypt", "decrypt"],
  );
}

async function createKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
}

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
