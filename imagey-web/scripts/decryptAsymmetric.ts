import { readFileSync, writeFileSync } from "fs";
import { decryptAESGCM, deriveKey } from "./cryptoHelper";

async function main() {
  const [, , inputFile, privateKeyFile, publicKeyFile, outputFile] =
    process.argv;
  if (!inputFile || !privateKeyFile || !publicKeyFile || !outputFile) {
    console.error(
      "Usage: ts-node decryptAsymmetric.ts <inputFile> <privateKeyFile> <publicKeyFile> <outputFile>",
    );
    process.exit(1);
  }
  const inputData = readFileSync(inputFile);
  const privateKeyJson = JSON.parse(readFileSync(privateKeyFile, "utf-8"));
  const publicKeyJson = JSON.parse(readFileSync(publicKeyFile, "utf-8"));

  const derivedKey = await deriveKey(privateKeyJson, publicKeyJson);
  const decrypted = await decryptAESGCM(
    new Uint8Array(inputData).buffer,
    derivedKey,
  );
  writeFileSync(outputFile, new Uint8Array(decrypted));
}

main().catch(console.error);
