import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  decryptAESGCM,
  encryptAESGCM,
  importSymmetricKey,
  decryptKeyFromBytes,
} from "./cryptoHelper.ts";
import { TestData } from "../tests/integration/testdata.ts";

async function main() {
  const mary = TestData.mary;

  // 1. Get settings key
  const settingsKeyFile = resolve(
    process.cwd(),
    "tests/images/encrypted/mary@imagey.cloud/keys/mary@imagey.cloud/encrypted-shared.key",
  );
  const encryptedSettingsKey = readFileSync(settingsKeyFile);
  const settingsKeyJson = await decryptKeyFromBytes(
    new Uint8Array(encryptedSettingsKey),
    mary.privateMainKey,
    mary.publicMainKey,
  );
  const settingsKey = await importSymmetricKey(settingsKeyJson);

  // 2. Get root folder key
  const documentListId = "68980188-577d-4d2f-9e36-a6b32b25cd3a";
  const rootFolderKeyFile = resolve(
    process.cwd(),
    "tests/images/encrypted",
    documentListId,
    "keys/mary@imagey.cloud/encrypted-shared.key",
  );
  const encryptedRootFolderKey = readFileSync(rootFolderKeyFile);

  try {
    const rootFolderKeyBytes = await decryptAESGCM(
      new Uint8Array(encryptedRootFolderKey).buffer,
      settingsKey,
    );
    const rootFolderKeyJson = JSON.parse(
      new TextDecoder().decode(rootFolderKeyBytes),
    );
    const rootFolderKey = await importSymmetricKey(rootFolderKeyJson);

    // 3. Read metadata
    const metadataPath = resolve(
      process.cwd(),
      "tests/images/encrypted",
      documentListId,
      "metadata",
    );
    const encryptedMetadata = readFileSync(metadataPath);
    const decryptedMetadataBytes = await decryptAESGCM(
      new Uint8Array(encryptedMetadata).buffer,
      rootFolderKey,
    );
    const metadataStr = new TextDecoder().decode(decryptedMetadataBytes);
    const metadata = JSON.parse(metadataStr);

    metadata.documents = [
      "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
      "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    ];

    console.log("Updated metadata:", metadata);

    const newEncryptedMetadata = await encryptAESGCM(
      new TextEncoder().encode(JSON.stringify(metadata)).buffer,
      rootFolderKey,
    );
    writeFileSync(metadataPath, Buffer.from(newEncryptedMetadata));
    console.log("Mary's root folder updated!");
  } catch (e) {
    console.error("Failed", e);
  }
}
main().catch(console.error);
