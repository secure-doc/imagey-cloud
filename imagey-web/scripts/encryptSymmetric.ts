import { readFileSync, writeFileSync } from "fs";
import {
  arrayBufferToBase64,
  encryptAESGCM,
  importSymmetricKey,
} from "./cryptoHelper.ts";

async function main() {
  const [, , inputFile, keyFile, outputFile] = process.argv;
  if (!inputFile || !keyFile || !outputFile) {
    console.error(
      "Usage: node --experimental-strip-types encryptSymmetric.ts <inputFile> <keyFile> <outputFile>",
    );
    process.exit(1);
  }
  const inputData = readFileSync(inputFile);
  const keyJson = JSON.parse(readFileSync(keyFile, "utf-8"));
  const key = await importSymmetricKey(keyJson);
  const encrypted = await encryptAESGCM(new Uint8Array(inputData).buffer, key);
  console.log("encrypted: " + arrayBufferToBase64(encrypted));
  writeFileSync(outputFile, new Uint8Array(encrypted));
}

main().catch(console.error);
