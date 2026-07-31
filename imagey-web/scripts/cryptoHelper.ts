import { readFileSync, writeFileSync } from "fs";

export async function deriveKey(
  privateKey: any,
  publicKey: any,
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

export async function importSymmetricKey(key: any) {
  return crypto.subtle.importKey(
    "jwk",
    key,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function decryptAESGCM(
  payload: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const combined = new Uint8Array(payload);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

export async function encryptAESGCM(
  payload: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    payload,
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return combined.buffer;
}

export async function decryptKey(
  encryptedBase64: string,
  privateKey: any,
  publicKey: any,
): Promise<any> {
  const combined = base64ToArrayBuffer(encryptedBase64);
  return decryptKeyFromBytes(combined, privateKey, publicKey);
}

export async function decryptKeyFromBytes(
  combined: Uint8Array,
  privateKey: any,
  publicKey: any,
): Promise<any> {
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const derivedKey = await deriveKey(privateKey, publicKey);
  const decryptedBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    derivedKey,
    ciphertext,
  );
  const text = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(text);
}

export async function encryptKey(
  keyToEncrypt: any,
  privateKey: any,
  publicKey: any,
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
  return arrayBufferToBase64(combined.buffer);
}

export async function decryptWithPassword(
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

export async function decryptPrivatePasswordKey(
  encrypted: string,
  password: string,
): Promise<any> {
  const decrypted = await decryptWithPassword(encrypted, password);
  return JSON.parse(decrypted);
}
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64ToArrayBuffer(base64: string): Uint8Array {
  let b64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) {
    b64 += "=";
  }
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}
