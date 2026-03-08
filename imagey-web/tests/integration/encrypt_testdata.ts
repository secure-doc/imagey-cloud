import { webcrypto } from "crypto";
import * as fs from "fs";

const crypto = webcrypto as unknown; // Node's WebCrypto

const docs = [
  {
    documentId: "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    name: "beach-1836467_1920.jpg",
    previewImageId: "6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
    size: 478098,
    smallImageId: "7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0",
    type: "image/jpeg",
  },
  {
    documentId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    name: "beach-4524911_1920.jpg",
    previewImageId: "f232a44d-6396-42bb-9196-f0013d46ded5",
    size: 655269,
    smallImageId: "330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
    type: "image/jpeg",
  },
  {
    documentId: "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
    name: "child-355176_1920.jpg",
    previewImageId: "9e4742c8-b3b8-44b9-ab83-8e4912271dee",
    size: 4429938,
    smallImageId: "d09630e2-437e-40ff-8da1-753a0e05caad",
    type: "image/jpeg",
  },
  {
    documentId: "78d1b093-45ec-4a25-9594-615ca2d70ba2",
    name: "beach-4524911_480.jpg",
    previewImageId: "2211b759-744c-40f3-aec2-10c8d549a49e",
    size: 714088,
    smallImageId: "01e9b15b-655c-4baf-8fd3-78c23df70a67",
    type: "image/jpeg",
  },
];

const maryPrivateKey = {
  crv: "P-256",
  d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
  ext: true,
  key_ops: ["deriveKey", "deriveBits"], // added deriveBits for Node compatibility
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

async function deriveKey(privateKey: unknown, publicKey: unknown) {
  const priv = await (crypto as Crypto).subtle.importKey(
    "jwk",
    privateKey as JsonWebKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const pub = await (crypto as Crypto).subtle.importKey(
    "jwk",
    publicKey as JsonWebKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  return (crypto as Crypto).subtle.deriveKey(
    { name: "ECDH", public: pub },
    priv,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

function base64ToArrayBuffer(base64: string) {
  const binary = Buffer.from(base64, "base64").toString("binary");
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return buffer.buffer;
}

async function decryptKey(
  encryptedBase64: string,
  privateKey: unknown,
  publicKey: unknown,
) {
  const combined = base64ToArrayBuffer(encryptedBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const derivedKey = await deriveKey(privateKey, publicKey);
  const decryptedBytes = await (crypto as Crypto).subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    derivedKey,
    ciphertext,
  );
  const text = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(text);
}

async function encryptAESGCM(key: unknown, data: BufferSource) {
  const iv = (crypto as Crypto).getRandomValues(new Uint8Array(12));
  const ciphertext = await (crypto as Crypto).subtle.encrypt(
    { name: "AES-GCM", iv },
    key as CryptoKey,
    data,
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return Buffer.from(combined.buffer).toString("base64");
}

const maryPublicKey = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};

async function main() {
  for (const doc of docs) {
    const sharedKeyBase64 = fs.readFileSync(
      `./tests/images/encrypted/${doc.documentId}/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
      "utf8",
    );

    // The key in decryptKey is returned as a JSON object, we need to import it as a CryptoKey!
    const keyToDecrypt = await decryptKey(
      sharedKeyBase64,
      maryPrivateKey,
      maryPublicKey,
    );
    const documentKey = await (crypto as Crypto).subtle.importKey(
      "jwk",
      keyToDecrypt as JsonWebKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    const dataArray = new TextEncoder().encode(JSON.stringify(doc));
    const encryptedData = await encryptAESGCM(documentKey, dataArray);

    console.log(`Document: ${doc.documentId}`);
    console.log(`Encrypted Data: ${encryptedData}`);

    const metadataPayload = {
      documentId: doc.documentId,
      smallImageId: doc.smallImageId,
      previewImageId: doc.previewImageId,
      encryptedData,
    };

    const serverDir = `../imagey-server/src/test/resources/data/mary@imagey.cloud/documents/${doc.documentId}`;
    if (fs.existsSync(serverDir)) {
      const targetFile = `${serverDir}/meta-data`;
      fs.writeFileSync(targetFile, JSON.stringify(metadataPayload));
    }

    fs.writeFileSync(
      `./tests/images/encrypted/${doc.documentId}/meta-data`,
      JSON.stringify(metadataPayload),
    );
  }
}

main().catch(console.error);
