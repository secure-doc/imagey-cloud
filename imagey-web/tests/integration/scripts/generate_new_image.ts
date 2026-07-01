import { webcrypto } from "crypto";
import * as fs from "fs";
const crypto = webcrypto as unknown as Crypto;

const maryPublicKey = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

const documentId = "profile-pic-doc-id";
const contentId = "profile-pic-content-id";
const imagePath = "../images/vitalykobzun-frau-7385461.jpg";

async function encryptNewImage() {
  const documentKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const pub = await crypto.subtle.importKey(
    "jwk",
    maryPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  const tempKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    tempKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const exportedDocumentKey = await crypto.subtle.exportKey("jwk", documentKey);
  const ivKey = crypto.getRandomValues(new Uint8Array(12));
  const encryptedKeyBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivKey },
    derivedKey,
    new TextEncoder().encode(JSON.stringify(exportedDocumentKey)),
  );

  const combinedKey = new Uint8Array(12 + encryptedKeyBytes.byteLength);
  combinedKey.set(ivKey, 0);
  combinedKey.set(new Uint8Array(encryptedKeyBytes), 12);
  const sharedKeyBase64 = Buffer.from(combinedKey.buffer).toString("base64");

  await (crypto as Crypto).subtle.exportKey("jwk", tempKeyPair.publicKey);
  const finalSharedKey = JSON.stringify({
    issuer: "mary@imagey.cloud",
    kid: "0",
    sharedKey: sharedKeyBase64,
  });

  const imageData = fs.readFileSync(imagePath);
  const ivData = crypto.getRandomValues(new Uint8Array(12));
  const encryptedDataBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivData },
    documentKey,
    imageData,
  );

  const combinedData = new Uint8Array(12 + encryptedDataBytes.byteLength);
  combinedData.set(ivData, 0);
  combinedData.set(new Uint8Array(encryptedDataBytes), 12);

  fs.mkdirSync(
    `../images/encrypted/${documentId}/shared-keys/mary@imagey.cloud`,
    { recursive: true },
  );
  fs.mkdirSync(`../images/encrypted/${documentId}/contents`, {
    recursive: true,
  });

  fs.writeFileSync(
    `../images/encrypted/${documentId}/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
    finalSharedKey,
  );
  fs.writeFileSync(
    `../images/encrypted/${documentId}/contents/${contentId}`,
    Buffer.from(combinedData.buffer),
  );

  // Also create metadata for it
  const metadata = {
    documentId,
    name: "vitalykobzun-frau-7385461.jpg",
    previewImageId: contentId,
    smallImageId: contentId,
    type: "image/jpeg",
    size: imageData.length,
  };

  // Encrypt metadata
  const ivMeta = crypto.getRandomValues(new Uint8Array(12));
  const encryptedMetaBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivMeta },
    documentKey,
    new TextEncoder().encode(JSON.stringify(metadata)),
  );

  const combinedMeta = new Uint8Array(12 + encryptedMetaBytes.byteLength);
  combinedMeta.set(ivMeta, 0);
  combinedMeta.set(new Uint8Array(encryptedMetaBytes), 12);
  const metaBase64 = Buffer.from(combinedMeta.buffer).toString("base64");

  fs.writeFileSync(
    `../images/encrypted/${documentId}/meta-data`,
    JSON.stringify({
      documentId,
      previewImageId: contentId,
      smallImageId: contentId,
      encryptedData: metaBase64,
    }),
  );

  console.log("Image encrypted successfully");
}

encryptNewImage().catch(console.error);
