import { readFileSync, writeFileSync } from "fs";
import { encryptAESGCM, importSymmetricKey } from "./cryptoHelper";

async function main() {
  const [, , inputFile, keyFile, outputFile] = process.argv;
  if (!inputFile || !keyFile || !outputFile) {
    console.error(
      "Usage: ts-node encryptSymmetric.ts <inputFile> <keyFile> <outputFile>",
    );
    process.exit(1);
  }
  const inputData = readFileSync(inputFile);
  const keyJson = JSON.parse(readFileSync(keyFile, "utf-8"));
  const key = await importSymmetricKey(keyJson);
  const encrypted = await encryptAESGCM(new Uint8Array(inputData).buffer, key);
  writeFileSync(outputFile, new Uint8Array(encrypted));
}

main().catch(console.error);
