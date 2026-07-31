import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  decryptKey,
  decryptKeyFromBytes,
  decryptAESGCM,
  encryptAESGCM,
  importSymmetricKey,
} from "./cryptoHelper.ts";

const privateMainKey = {
  crv: "P-256",
  d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
  ext: true,
  key_ops: ["deriveKey"],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

const publicMainKey = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

async function main() {
  const dataPath = resolve(
    process.cwd(),
    "../imagey-server/src/test/resources/data/mary@imagey.cloud",
  );
  const encryptedSharedKeyPath = resolve(
    dataPath,
    "documents/mary@imagey.cloud/keys/mary@imagey.cloud/encrypted-shared.key",
  );
  const metadataEncPath = resolve(
    dataPath,
    "documents/mary@imagey.cloud/metadata.enc",
  );

  console.log("Reading:", encryptedSharedKeyPath);
  const encryptedSharedKeyBytes = readFileSync(encryptedSharedKeyPath);

  console.log("Decrypting shared key...");
  const decryptedSharedKey = await decryptKeyFromBytes(
    new Uint8Array(encryptedSharedKeyBytes),
    privateMainKey,
    publicMainKey,
  );
  console.log("Decrypted shared key:", decryptedSharedKey);

  console.log("Reading:", metadataEncPath);
  const metadataEnc = readFileSync(metadataEncPath);
  const metadataArrayBuffer = new Uint8Array(metadataEnc).buffer;

  console.log("Decrypting metadata...");
  const cryptoSymmetricKey = await importSymmetricKey(decryptedSharedKey);
  const decryptedMetadataBuffer = await decryptAESGCM(
    metadataArrayBuffer,
    cryptoSymmetricKey,
  );

  const decryptedMetadataString = new TextDecoder().decode(
    decryptedMetadataBuffer,
  );
  console.log("Decrypted metadata:", decryptedMetadataString);

  const metadataJson = JSON.parse(decryptedMetadataString);
  metadataJson.documents = "68980188-577d-4d2f-9e36-a6b32b25cd3a";
  metadataJson.rootFolderId = "68980188-577d-4d2f-9e36-a6b32b25cd3a";
  metadataJson.chatFolderId = "9c59a4f3-ae55-4c4b-9e4a-2079a2446738";
  metadataJson.chatFolder = "9c59a4f3-ae55-4c4b-9e4a-2079a2446738";
  metadataJson.profileDocumentId = "9b71fa98-8616-4222-b03e-d189289ccbd0";
  metadataJson.profilePicDocumentId = "3ae437c9-c71e-4cf0-b066-de34d75e1af3";

  console.log("Updated metadata:", metadataJson);

  console.log("Re-encrypting metadata...");
  const newMetadataString = JSON.stringify(metadataJson);
  const newMetadataBuffer = new TextEncoder().encode(newMetadataString).buffer;

  const newEncryptedMetadataBuffer = await encryptAESGCM(
    newMetadataBuffer,
    cryptoSymmetricKey,
  );

  const frontendMetadataPath = resolve(
    process.cwd(),
    "tests/images/encrypted/mary@imagey.cloud/metadata",
  );
  writeFileSync(metadataEncPath, Buffer.from(newEncryptedMetadataBuffer));
  writeFileSync(frontendMetadataPath, Buffer.from(newEncryptedMetadataBuffer));
  console.log("Successfully updated metadata.enc and frontend metadata mock");
}

main().catch(console.error);
