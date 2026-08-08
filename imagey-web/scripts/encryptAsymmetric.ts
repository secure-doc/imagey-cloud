import { readFileSync, writeFileSync } from "fs";
import { encryptAESGCM, deriveKey, arrayBufferToBase64 } from "./cryptoHelper.ts";

async function main() {
  const [, , inputFile, privateKeyFile, publicKeyFile, outputFile] =
    process.argv;
  if (!inputFile || !privateKeyFile || !publicKeyFile || !outputFile) {
    console.error(
      "Usage: node --experimental-strip-types encryptAsymmetric.ts <inputFile> <privateKeyFile> <publicKeyFile> <outputFile>",
    );
    process.exit(1);
  }
  const inputData = readFileSync(inputFile);
  const privateKeyJson = JSON.parse(readFileSync(privateKeyFile, "utf-8"));
  const publicKeyJson = JSON.parse(readFileSync(publicKeyFile, "utf-8"));

  const derivedKey = await deriveKey(privateKeyJson, publicKeyJson);
  const encrypted = await encryptAESGCM(
    new Uint8Array(inputData).buffer,
    derivedKey,
  );
  console.log("encrypted: " + arrayBufferToBase64(encrypted))
  writeFileSync(outputFile, new Uint8Array(encrypted));
}

main().catch(console.error);
