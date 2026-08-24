import { readFileSync, writeFileSync } from "fs";
import { base64ToArrayBuffer } from "./cryptoHelper.ts";

async function main() {
  const [, , inputFile, password, outputFile] = process.argv;
  if (!inputFile || !password || !outputFile) {
    console.error(
      "Usage: node --experimental-strip-types decryptWithPassword.ts <inputFile> <password> <outputFile>",
    );
    process.exit(1);
  }
  const inputData = readFileSync(inputFile, "utf-8");
  const decrypted = await decryptWithPassword(inputData, password);
  writeFileSync(outputFile, decrypted, "utf-8");
}

main().catch(console.error);

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
