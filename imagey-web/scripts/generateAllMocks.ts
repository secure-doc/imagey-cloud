import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import {
  encryptAESGCM,
  encryptKey,
  importSymmetricKey,
} from "./cryptoHelper.ts";
import { TestData } from "../tests/integration/testdata.ts";

async function generateFolderMock(
  folderId: string,
  name: string,
  type: string,
  parentKey: CryptoKey,
  parentKeyJson: any,
  issuerType: string = "USER",
  issuer: string,
) {
  const folderKeyJson = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const exportedFolderKey = await crypto.subtle.exportKey("jwk", folderKeyJson);
  const folderKey = await importSymmetricKey(exportedFolderKey);

  const payload = JSON.stringify({
    name,
    type,
    documents: type === "Folder" ? [] : undefined,
  });
  const encryptedPayload = await encryptAESGCM(
    new TextEncoder().encode(payload).buffer,
    folderKey,
  );

  const encryptedKey = await encryptAESGCM(
    new TextEncoder().encode(JSON.stringify(exportedFolderKey)).buffer,
    parentKey,
  );

  const dir = resolve(process.cwd(), "tests/images/encrypted", folderId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(resolve(dir, "metadata"), Buffer.from(encryptedPayload));

  const keysDir = resolve(dir, "keys", issuer);
  if (!existsSync(keysDir)) {
    mkdirSync(keysDir, { recursive: true });
  }
  writeFileSync(
    resolve(keysDir, "encrypted-shared.key"),
    Buffer.from(encryptedKey),
  );

  return exportedFolderKey;
}

async function main() {
  const users = ["mary", "alice", "laura", "bill"];

  for (const user of users) {
    const data = TestData[user as keyof typeof TestData];
    const settings = data.settings;
    if (!settings) continue;

    // Generate settings key
    const settingsKeyJson = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const exportedSettingsKey = await crypto.subtle.exportKey(
      "jwk",
      settingsKeyJson,
    );
    const settingsKey = await importSymmetricKey(exportedSettingsKey);

    const email = `${user}@imagey.cloud`;

    // 1. Settings Document
    const settingsPayload = JSON.stringify(settings);
    const encryptedSettingsPayload = await encryptAESGCM(
      new TextEncoder().encode(settingsPayload).buffer,
      settingsKey,
    );

    const encryptedSettingsKey = await encryptKey(
      exportedSettingsKey,
      data.privateMainKey,
      data.publicMainKey,
    );

    const settingsDir = resolve(process.cwd(), "tests/images/encrypted", email);
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }

    writeFileSync(
      resolve(settingsDir, "metadata"),
      Buffer.from(encryptedSettingsPayload),
    );

    const settingsKeysDir = resolve(settingsDir, "keys", email);
    if (!existsSync(settingsKeysDir)) {
      mkdirSync(settingsKeysDir, { recursive: true });
    }
    writeFileSync(
      resolve(settingsKeysDir, "encrypted-shared.key"),
      Buffer.from(encryptedSettingsKey, "base64"),
    );

    // 2. Root Folder
    await generateFolderMock(
      settings.documentListId,
      "Images",
      "Folder",
      settingsKey,
      exportedSettingsKey,
      "USER",
      email,
    );

    // 3. Chat Folder
    await generateFolderMock(
      settings.chatListId,
      "Chats",
      "Folder",
      settingsKey,
      exportedSettingsKey,
      "USER",
      email,
    );

    // 4. Profile Document
    await generateFolderMock(
      settings.profileId,
      "Profile",
      "Profile",
      settingsKey,
      exportedSettingsKey,
      "USER",
      email,
    );

    console.log(`Generated mocks for ${user}`);
  }
}

main().catch(console.error);
