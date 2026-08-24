import { readFileSync, writeFileSync } from "fs";
import { decryptAESGCM, importSymmetricKey } from "./cryptoHelper.ts";

async function main() {
  const [, , inputFile, keyFile, outputFile] = process.argv;
  if (!inputFile || !keyFile || !outputFile) {
    console.error(
      "Usage: node --experimental-strip-types decryptSymmetric.ts <inputFile> <keyFile> <outputFile>",
    );
    process.exit(1);
  }
  const inputData = readFileSync(inputFile);
  const keyJson = JSON.parse(readFileSync(keyFile, "utf-8"));
  const key = await importSymmetricKey(keyJson);
  const decrypted = await decryptAESGCM(new Uint8Array(inputData).buffer, key);
  writeFileSync(outputFile, new Uint8Array(decrypted));
}

main().catch(console.error);
