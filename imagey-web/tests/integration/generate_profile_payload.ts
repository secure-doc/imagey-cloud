import { webcrypto } from "crypto";
const crypto = webcrypto as unknown as Crypto;

const maryPublicKey = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

const profileContent = {
  name: "Mary Doe",
  profilePictureId: "profile-pic-doc-id",
  emails: ["mary.doe@example.com"],
};

async function generateProfile() {
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

  const exportedPubKey = await crypto.subtle.exportKey(
    "jwk",
    tempKeyPair.publicKey,
  );
  const finalSharedKey = JSON.stringify({
    encryptingPublicKey: exportedPubKey,
    key: sharedKeyBase64,
  });

  const ivData = crypto.getRandomValues(new Uint8Array(12));
  const encryptedDataBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivData },
    documentKey,
    new TextEncoder().encode(JSON.stringify(profileContent)),
  );

  const combinedData = new Uint8Array(12 + encryptedDataBytes.byteLength);
  combinedData.set(ivData, 0);
  combinedData.set(new Uint8Array(encryptedDataBytes), 12);
  const encryptedDataBase64 = Buffer.from(combinedData.buffer).toString(
    "base64",
  );

  console.log(
    JSON.stringify(
      {
        documentId: "profile",
        encryptedData: encryptedDataBase64,
        sharedKey: finalSharedKey,
      },
      null,
      2,
    ),
  );
}

generateProfile().catch(console.error);
