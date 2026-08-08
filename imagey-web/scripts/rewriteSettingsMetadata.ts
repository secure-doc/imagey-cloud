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

  const oldSettingsKeyFile = "/tmp/old-settings-key.enc";
  const oldSettingsKeyBuffer = readFileSync(oldSettingsKeyFile);
  const oldSettingsKeyBytes = new Uint8Array(oldSettingsKeyBuffer);

  console.log("oldSettingsKeyBytes length:", oldSettingsKeyBytes.length);
  const oldSettingsKeyJson = await decryptKeyFromBytes(
    oldSettingsKeyBytes,
    oldMaryPrivate,
    oldMaryPublic,
  );
  console.log("oldSettingsKeyJson:", oldSettingsKeyJson);
  const settingsKey = await importSymmetricKey(oldSettingsKeyJson);
  console.log("imported settings key!");
}
main().catch(console.error);
