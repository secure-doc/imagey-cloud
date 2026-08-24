import { readFileSync, writeFileSync } from "fs";
import {
  base64ToArrayBuffer,
  decryptAESGCM,
  importSymmetricKey,
} from "./cryptoHelper.ts";

async function main() {
  const [, , inputFile, keyFile, outputFile] = process.argv;
  if (!inputFile || !keyFile || !outputFile) {
    console.error(
      "Usage: node --experimental-strip-types decryptSymmetric.ts <inputFile> <keyFile> <outputFile>",
    );
    process.exit(1);
  }
  const inputJson = JSON.parse(readFileSync(inputFile, "utf-8"));
  const inputBase64 = inputJson["sharedKey"];
  const keyJson = JSON.parse(readFileSync(keyFile, "utf-8"));
  console.log("decryptKey imported: " + JSON.stringify(keyJson));
  const key = await importSymmetricKey(keyJson);
  console.log("encrypted: " + inputBase64);
  const buffer = base64ToArrayBuffer(inputBase64).buffer as ArrayBuffer;
  const decrypted = await decryptAESGCM(buffer, key);
  writeFileSync(outputFile, new Uint8Array(decrypted));
}

main().catch(console.error);
