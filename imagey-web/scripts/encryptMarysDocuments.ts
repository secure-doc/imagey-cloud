import { writeFileSync } from "fs";
import { TestData } from "../tests/integration/testdata.ts";

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
    publicKeyOrSymmetricKey: JsonWebKey,
    privateKey?: JsonWebKey,
  ): Promise<string> => {
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
    encrypted: string,
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
      console.log(
        "decryptKey imported: " + JSON.stringify(publicKeyOrSymmetricKey),
      );
      try {
        const decryptedKey = await decryptAESGCM(
          base64ToArrayBuffer(encrypted),
          cryptoKey,
        );
        console.log("key decrypted");
        const text = new TextDecoder().decode(decryptedKey);
        return JSON.parse(text);
      } catch (e) {
        console.log(
          "failed to decrypt " +
            encrypted +
            " with key " +
            JSON.stringify(publicKeyOrSymmetricKey),
        );
        throw e;
      }
    }
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
    nonce: string,
    serverPublicKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ): Promise<string> => {
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
  encryptMessage: async (message: string, key: JsonWebKey): Promise<string> => {
    const cryptoKey = await importSymmetricKey(key);
    const encoded = new TextEncoder().encode(message);
    const encrypted = await encryptAESGCM(
      encoded.buffer as ArrayBuffer,
      cryptoKey,
    );
    return arrayBufferToBase64(encrypted);
  },

  decryptMessage: async (
    encryptedBase64: string,
    key: JsonWebKey,
  ): Promise<string> => {
    const cryptoKey = await importSymmetricKey(key);
    const encryptedBuffer = base64ToArrayBuffer(encryptedBase64);
    const decryptedBuffer = await decryptAESGCM(encryptedBuffer, cryptoKey);
    return new TextDecoder().decode(decryptedBuffer);
  },

  arrayBufferToBase64,
  base64ToArrayBuffer,
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

async function main() {
  const [, , privateKeyFile, publicKeyFile] = process.argv;
  if (!privateKeyFile || !publicKeyFile) {
    console.error(
      "Usage: node --experimental-strip-types encryptAsymmetric.ts <privateKeyFile> <publicKeyFile>",
    );
    process.exit(1);
  }
  const settingsText = JSON.stringify(TestData.mary.settings);
  const encryptedSettings = await cryptoService.encryptDocument(
    TestData.mary.settingsKey,
    [new TextEncoder().encode(settingsText).buffer],
  );
  writeFileSync("settings.enc", new Uint8Array(encryptedSettings[0]));
  const decryptedSettings = await cryptoService.decryptDocument(
    TestData.mary.settingsKey,
    encryptedSettings[0],
  );
  console.log(
    "decrypted settings: " + new TextDecoder().decode(decryptedSettings),
  );
  const rootFolder = {
    documents: [
      "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
      "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    ],
    type: "folder",
    name: "Documents",
  };
  const rootFolderText = JSON.stringify(rootFolder);
  const encrytpedRootFolder = await cryptoService.encryptDocument(
    TestData.mary.documents[0].key!,
    [new TextEncoder().encode(rootFolderText).buffer],
  );
  writeFileSync("documents.enc", new Uint8Array(encrytpedRootFolder[0]));
  const decryptedRootFolder = await cryptoService.decryptDocument(
    TestData.mary.documents[0].key!,
    encrytpedRootFolder[0],
  );
  console.log(
    "decrypted root folder: " + new TextDecoder().decode(decryptedRootFolder),
  );
  const encrypted_root_folder_key = await cryptoService.encryptKey(
    TestData.mary.documents[0].key!,
    TestData.mary.settingsKey!,
  );
  console.log("encrypted root folder key: " + encrypted_root_folder_key);
  const decrytped_root_folder_key = await cryptoService.decryptKey(
    encrypted_root_folder_key,
    TestData.mary.settingsKey!,
  );
  console.log(
    "decrypted root folder key: " + JSON.stringify(decrytped_root_folder_key),
  );
  const document_f9910aa7_4db6_4b02_b596_c3ccf872ae98 = {
    name: "beach-4524911_1920.jpg",
    type: "image/jpeg",
    size: "3334311",
    contentId: "f232a44d-6396-42bb-9196-f0013d46ded5",
    smallImageId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    previewImageId: "330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
  };
  const document_f9910aa7_4db6_4b02_b596_c3ccf872ae98_text = JSON.stringify(
    document_f9910aa7_4db6_4b02_b596_c3ccf872ae98,
  );
  const encrypted_document_f9910aa7_4db6_4b02_b596_c3ccf872ae98 =
    await cryptoService.encryptDocument(TestData.mary.documents[1].key!, [
      new TextEncoder().encode(
        document_f9910aa7_4db6_4b02_b596_c3ccf872ae98_text,
      ).buffer,
    ]);
  writeFileSync(
    "f9910aa7-4db6-4b02-b596-c3ccf872ae98.enc",
    new Uint8Array(encrypted_document_f9910aa7_4db6_4b02_b596_c3ccf872ae98[0]),
  );
  const decrypted_document_f9910aa7_4db6_4b02_b596_c3ccf872ae98 =
    await cryptoService.decryptDocument(
      TestData.mary.documents[1].key!,
      encrypted_document_f9910aa7_4db6_4b02_b596_c3ccf872ae98[0],
    );
  console.log(
    "decrypted f9910aa7-4db6-4b02-b596-c3ccf872ae98: " +
      new TextDecoder().decode(
        decrypted_document_f9910aa7_4db6_4b02_b596_c3ccf872ae98,
      ),
  );
  const encrypted_f9910aa7_4db6_4b02_b596_c3ccf872ae98_key =
    await cryptoService.encryptKey(
      TestData.mary.documents[1].key!,
      TestData.mary.documents[0].key!,
    );
  console.log(
    "encrypted f9910aa7-4db6-4b02-b596-c3ccf872ae98 key: " +
      encrypted_f9910aa7_4db6_4b02_b596_c3ccf872ae98_key,
  );
  const decrytped_f9910aa7_4db6_4b02_b596_c3ccf872ae98_key =
    await cryptoService.decryptKey(
      encrypted_f9910aa7_4db6_4b02_b596_c3ccf872ae98_key,
      TestData.mary.documents[0].key!,
    );
  console.log(
    "decrypted f9910aa7-4db6-4b02-b596-c3ccf872ae98 key: " +
      JSON.stringify(decrytped_f9910aa7_4db6_4b02_b596_c3ccf872ae98_key),
  );
  const document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3 = {
    name: "beach-4524911_1920.jpg",
    type: "image/jpeg",
    size: "3334311",
    contentId: "f232a44d-6396-42bb-9196-f0013d46ded5",
    smallImageId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    previewImageId: "330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
  };
  const document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_text = JSON.stringify(
    document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3,
  );
  const encrypted_document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3 =
    await cryptoService.encryptDocument(TestData.mary.documents[2].key!, [
      new TextEncoder().encode(
        document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_text,
      ).buffer,
    ]);
  writeFileSync(
    "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3.enc",
    new Uint8Array(encrypted_document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3[0]),
  );
  const decrypted_document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3 =
    await cryptoService.decryptDocument(
      TestData.mary.documents[2].key!,
      encrypted_document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3[0],
    );
  console.log(
    "decrypted bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3: " +
      new TextDecoder().decode(
        decrypted_document_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3,
      ),
  );
  const encrypted_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_key =
    await cryptoService.encryptKey(
      TestData.mary.documents[2].key!,
      TestData.mary.documents[0].key!,
    );
  console.log(
    "encrypted bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3 key: " +
      encrypted_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_key,
  );
  const decrypted_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_key =
    await cryptoService.decryptKey(
      encrypted_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_key,
      TestData.mary.documents[0].key!,
    );
  console.log(
    "decrypted bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3 key: " +
      JSON.stringify(decrypted_bb66aba3_8338_4ef4_a6f8_43ed0b39ecd3_key),
  );
}
main().catch(console.error);

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
