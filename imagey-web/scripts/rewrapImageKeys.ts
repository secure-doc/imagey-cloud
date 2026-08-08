import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  decryptAESGCM,
  encryptAESGCM,
  importSymmetricKey,
  decryptKey,
  encryptKey,
  base64ToArrayBuffer,
  arrayBufferToBase64,
  decryptKeyFromBytes,
} from "./cryptoHelper.ts";
import { TestData } from "../tests/integration/testdata.ts";

const oldMaryPrivate = {
  crv: "P-256",
  d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
  ext: true,
  key_ops: ["deriveKey"],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

const oldMaryPublic = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

async function main() {
  const oldSettingsKeyFile = "/tmp/old-settings-key.enc";
  // The old file might be binary! Let's read it as a buffer
  const oldSettingsKeyBuffer = readFileSync(oldSettingsKeyFile);
  // Is it base64? Let's check if it only contains base64 chars
  const str = oldSettingsKeyBuffer.toString("utf-8");
  let oldSettingsKeyBytes: Uint8Array;
  if (/^[A-Za-z0-9+/=_-]+$/.test(str.trim())) {
    oldSettingsKeyBytes = base64ToArrayBuffer(str.trim());
  } else {
    oldSettingsKeyBytes = new Uint8Array(oldSettingsKeyBuffer);
  }
  const oldSettingsKeyJson = await decryptKeyFromBytes(
    oldSettingsKeyBytes,
    oldMaryPrivate,
    oldMaryPublic,
  );
  console.log("Decrypted old settings key!");
  const oldSettingsKey = await importSymmetricKey(oldSettingsKeyJson);

  const oldRootFolderKeyFile = "/tmp/old-root-folder-key.enc";
  const oldRootFolderKeyBuffer = readFileSync(oldRootFolderKeyFile);
  const oldRootFolderKeyStr = oldRootFolderKeyBuffer.toString("utf-8");
  let oldRootFolderKeyBytesToDecrypt: Uint8Array;
  if (/^[A-Za-z0-9+/=_-]+$/.test(oldRootFolderKeyStr.trim())) {
    oldRootFolderKeyBytesToDecrypt = base64ToArrayBuffer(
      oldRootFolderKeyStr.trim(),
    );
  } else {
    oldRootFolderKeyBytesToDecrypt = new Uint8Array(oldRootFolderKeyBuffer);
  }
  const oldRootFolderKeyBytes = await decryptAESGCM(
    oldRootFolderKeyBytesToDecrypt.buffer,
    oldSettingsKey,
  );
  console.log("Decrypted old root folder key!");
  const oldRootFolderKeyJson = JSON.parse(
    new TextDecoder().decode(oldRootFolderKeyBytes),
  );
  const oldRootFolderKey = await importSymmetricKey(oldRootFolderKeyJson);

  const newSettingsKeyFile = resolve(
    process.cwd(),
    "tests/images/encrypted/mary@imagey.cloud/keys/mary@imagey.cloud/encrypted-shared.key",
  );
  const newSettingsKeyBuffer = readFileSync(newSettingsKeyFile);
  const newSettingsKeyStr = newSettingsKeyBuffer.toString("utf-8");
  let newSettingsKeyBytes: Uint8Array;
  if (/^[A-Za-z0-9+/=_-]+$/.test(newSettingsKeyStr.trim())) {
    newSettingsKeyBytes = base64ToArrayBuffer(newSettingsKeyStr.trim());
  } else {
    newSettingsKeyBytes = new Uint8Array(newSettingsKeyBuffer);
  }
  const newSettingsKeyJson = await decryptKeyFromBytes(
    newSettingsKeyBytes,
    TestData.mary.privateMainKey,
    TestData.mary.publicMainKey,
  );
  console.log("Decrypted new settings key!");
  const newSettingsKey = await importSymmetricKey(newSettingsKeyJson);

  const newRootFolderId = "68980188-577d-4d2f-9e36-a6b32b25cd3a";
  const newRootFolderKeyFile = resolve(
    process.cwd(),
    "tests/images/encrypted",
    newRootFolderId,
    "keys/mary@imagey.cloud/encrypted-shared.key",
  );
  const newRootFolderKeyBuffer = readFileSync(newRootFolderKeyFile);
  const newRootFolderKeyStr = newRootFolderKeyBuffer.toString("utf-8");
  let newRootFolderKeyBytesToDecrypt: Uint8Array;
  if (/^[A-Za-z0-9+/=_-]+$/.test(newRootFolderKeyStr.trim())) {
    newRootFolderKeyBytesToDecrypt = base64ToArrayBuffer(
      newRootFolderKeyStr.trim(),
    );
  } else {
    newRootFolderKeyBytesToDecrypt = new Uint8Array(newRootFolderKeyBuffer);
  }
  const newRootFolderKeyBytes = await decryptAESGCM(
    newRootFolderKeyBytesToDecrypt.buffer,
    newSettingsKey,
  );
  console.log("Decrypted new root folder key!");
  const newRootFolderKeyJson = JSON.parse(
    new TextDecoder().decode(newRootFolderKeyBytes),
  );
  const newRootFolderKey = await importSymmetricKey(newRootFolderKeyJson);

  const images = [
    "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
  ];
  for (const imageId of images) {
    const oldImageKeyFile = `/tmp/old-image-key-${imageId}.enc`;
    const oldImageKeyBuffer = readFileSync(oldImageKeyFile);
    const oldImageKeyStr = oldImageKeyBuffer.toString("utf-8");
    let oldImageKeyBytesToDecrypt: Uint8Array;
    if (/^[A-Za-z0-9+/=_-]+$/.test(oldImageKeyStr.trim())) {
      oldImageKeyBytesToDecrypt = base64ToArrayBuffer(oldImageKeyStr.trim());
    } else {
      oldImageKeyBytesToDecrypt = new Uint8Array(oldImageKeyBuffer);
    }
    const imageKeyBytes = await decryptAESGCM(
      oldImageKeyBytesToDecrypt.buffer,
      oldRootFolderKey,
    );
    const newEncryptedImageKey = await encryptAESGCM(
      imageKeyBytes,
      newRootFolderKey,
    );

    const destDir = resolve(
      process.cwd(),
      "tests/images/encrypted",
      imageId,
      "keys",
      newRootFolderId,
    );
    mkdirSync(destDir, { recursive: true });
    // Write new key as binary or base64? generateFolderMock writes base64! Let's follow whatever is currently being used for NEW keys
    writeFileSync(
      resolve(destDir, "encrypted-shared.key"),
      arrayBufferToBase64(newEncryptedImageKey),
    );
    console.log(`Rewrapped key for image ${imageId}`);
  }
}
main().catch(console.error);
