import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  decryptAESGCM,
  encryptAESGCM,
  importSymmetricKey,
  base64ToArrayBuffer,
  arrayBufferToBase64,
} from "./cryptoHelper.ts";

async function main() {
  // 1. Get the image symmetric key. We know the old root folder key.
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
  const oldSettingsKeyFile = "/tmp/old-settings-key.enc";
  const oldSettingsKeyBuffer = readFileSync(oldSettingsKeyFile);
  const str = oldSettingsKeyBuffer.toString("utf-8");
  let oldSettingsKeyBytes: Uint8Array;
  if (/^[A-Za-z0-9+/=_-]+$/.test(str.trim())) {
    oldSettingsKeyBytes = base64ToArrayBuffer(str.trim());
  } else {
    oldSettingsKeyBytes = new Uint8Array(oldSettingsKeyBuffer);
  }

  const { decryptKeyFromBytes } = await import("./cryptoHelper.ts");
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

  const oldSettingsKeyJson = await decryptKeyFromBytes(
    oldSettingsKeyBytes,
    oldMaryPrivate,
    oldMaryPublic,
  );
  const oldSettingsKey = await importSymmetricKey(oldSettingsKeyJson);
  const oldRootFolderKeyBytes = await decryptAESGCM(
    oldRootFolderKeyBytesToDecrypt.buffer,
    oldSettingsKey,
  );
  const oldRootFolderKeyJson = JSON.parse(
    new TextDecoder().decode(oldRootFolderKeyBytes),
  );
  const oldRootFolderKey = await importSymmetricKey(oldRootFolderKeyJson);

  const images = {
    "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3":
      "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
    "f9910aa7-4db6-4b02-b596-c3ccf872ae98":
      "BwEtcDjTQejb5vMpd/3xT1vtdaRPGeRPErhdVmtyfI36iDNjQs2nCWTEwNsvqXCDem++/DZiEH3ezfp3VNpOhRLMwJ1uMlvI6+r16d+ZjYeeSqweGa95h+00c7fKj3eFEmkPbXABGEoUW16JWVnHwwhoPhKvVKVBpgBxUOMrnqmjQgA4kNFyAPVWC/P4nR80/Ox5ibx+jeT/Lv8GdK8HFJcoiZEDsgzFaon3paw6/980934UHWqYz4ynsvFlaYCzYuM8WfTl9ByZVxcNIv8jJbrj9A6jqqY4uWu8gNOpT8V9Kt+Wqf3R9rhlw7a03/ZAndvuAtGM9hbz5qOCHWM7c1E=",
  };

  for (const [imageId, metaEncrypted] of Object.entries(images)) {
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
    const imageKeyJson = JSON.parse(new TextDecoder().decode(imageKeyBytes));
    const imageKey = await importSymmetricKey(imageKeyJson);

    const metaBytes = base64ToArrayBuffer(metaEncrypted);
    const metaDecryptedBytes = await decryptAESGCM(metaBytes.buffer, imageKey);
    const metaObj = JSON.parse(new TextDecoder().decode(metaDecryptedBytes));
    console.log(`Old metadata for ${imageId}:`, metaObj);

    // Change parentFolderId
    metaObj.parentFolderId = "68980188-577d-4d2f-9e36-a6b32b25cd3a";

    // Encrypt again
    const newMetaEncryptedBytes = await encryptAESGCM(
      new TextEncoder().encode(JSON.stringify(metaObj)).buffer,
      imageKey,
    );
    const newMetaBase64 = arrayBufferToBase64(newMetaEncryptedBytes);

    console.log(`\n======================================================`);
    console.log(`NEW METADATA FOR ${imageId}:`);
    console.log(newMetaBase64);
    console.log(`======================================================\n`);
  }
}
main().catch(console.error);
