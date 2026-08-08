import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { encryptAESGCM, arrayBufferToBase64 } from "./cryptoHelper.ts";

function arrayBufferToStandardBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

async function main() {
  const { decryptKeyFromBytes, importSymmetricKey } =
    await import("./cryptoHelper.ts");

  const users = {
    mary: {
      email: "mary@imagey.cloud",
      publicKey: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
        y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
      },
      privateKey: {
        crv: "P-256",
        d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
        ext: true,
        key_ops: ["deriveKey"],
        kty: "EC",
        x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
        y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
      },
      settings: {
        documentListId: "68980188-577d-4d2f-9e36-a6b32b25cd3a",
        chatListId: "9c59a4f3-ae55-4c4b-9e4a-2079a2446738",
        chatFolder: "9c59a4f3-ae55-4c4b-9e4a-2079a2446738",
        profileId: "9b71fa98-8616-4222-b03e-d189289ccbd0",
        profilePicDocumentId: "3ae437c9-c71e-4cf0-b066-de34d75e1af3",
      },
    },
    alice: {
      email: "alice@imagey.cloud",
      publicKey: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: "WlNo3xHpsegk3jRU8hZAX1lLtpreYYr56KKo7oAk1W8",
        y: "jXAPNGWZAQzHggF9gg15pov1GjPh_lPw-8VIeLIGQaM",
      },
      privateKey: {
        crv: "P-256",
        d: "fSA4NOX9E_nZksg8nxTKZ1_Gga2sF5d77ycfifX3xKE",
        ext: true,
        key_ops: ["deriveKey"],
        kty: "EC",
        x: "WlNo3xHpsegk3jRU8hZAX1lLtpreYYr56KKo7oAk1W8",
        y: "jXAPNGWZAQzHggF9gg15pov1GjPh_lPw-8VIeLIGQaM",
      },
      settings: {
        documentListId: "7ca8742e-821f-4276-862d-d5d2dbd42038",
        chatListId: "09128665-7ebf-426f-95fe-84f31ac53167",
        chatFolder: "09128665-7ebf-426f-95fe-84f31ac53167",
        profileId: "15917f2b-220c-4ecb-a08b-fb3a695b4424",
        profilePicDocumentId: "8e1ff0be-5c0e-40af-9f39-35ed57c8f1fb",
      },
    },
    laura: {
      email: "laura@imagey.cloud",
      publicKey: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: "dPd7doWoBiUEsALGowG_YbdvFvoPTgZcu-yo3xMhvko",
        y: "Ao1YeaTCJxqT0tEdp06Qk_rDLc6DvFkesV_49HQgCAY",
      },
      privateKey: {
        crv: "P-256",
        d: "MQ7zU77IfPN55gt8MZ-1tjADmeVkvsxrKzs5amcJx2U",
        ext: true,
        key_ops: ["deriveKey"],
        kty: "EC",
        x: "dPd7doWoBiUEsALGowG_YbdvFvoPTgZcu-yo3xMhvko",
        y: "Ao1YeaTCJxqT0tEdp06Qk_rDLc6DvFkesV_49HQgCAY",
      },
      settings: {
        documentListId: "fa2f1875-d2d1-4706-94f7-ba69880578e7",
        chatListId: "8d54110e-5ff5-4f78-a9d3-73e08393339a",
        chatFolder: "8d54110e-5ff5-4f78-a9d3-73e08393339a",
        profileId: "f3ed850d-4813-439b-a1c8-5a1d9a06fe24",
        profilePicDocumentId: "59197529-6431-478e-a166-adcef68c1f27",
      },
    },
    bill: {
      email: "bill@imagey.cloud",
      publicKey: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: "47SNY_Yfv3G16-udPCN0S6x_wi2YyQ3CKuoaGujUa9k",
        y: "lWPtfRADuCiZ0YiAfteHLtsP5zqbtvwnoeOmavdXE58",
      },
      privateKey: {
        crv: "P-256",
        d: "Bl5oD5DrxFqJEk6euTTkoUu1f_vkwb5G_GS4Uo3_ZB4",
        ext: true,
        key_ops: ["deriveKey"],
        kty: "EC",
        x: "47SNY_Yfv3G16-udPCN0S6x_wi2YyQ3CKuoaGujUa9k",
        y: "lWPtfRADuCiZ0YiAfteHLtsP5zqbtvwnoeOmavdXE58",
      },
      settings: {
        documentListId: "a2fdae4a-fac3-4d20-bfca-7c34146f8587",
        chatListId: "28f136c4-394a-416a-8f47-10f844b47ac5",
        chatFolder: "28f136c4-394a-416a-8f47-10f844b47ac5",
        profileId: "d841a46e-1522-4af8-8063-e1bb1e9585ed",
        profilePicDocumentId: "3122289e-dd5d-4017-b3d0-cc1e96b5f470",
      },
    },
  };

  const output: any = {};
  for (const [name, user] of Object.entries(users)) {
    const keyFile = resolve(
      process.cwd(),
      `tests/images/encrypted/${user.email}/keys/${user.email}/encrypted-shared.key`,
    );
    const keyBytes = new Uint8Array(readFileSync(keyFile));
    const encryptedSharedKey = arrayBufferToStandardBase64(keyBytes.buffer);

    const settingsKeyJson = await decryptKeyFromBytes(
      keyBytes,
      user.privateKey,
      user.publicKey,
    );
    const settingsKey = await importSymmetricKey(settingsKeyJson);

    const metaObj = {
      ...user.settings,
      documents: user.settings.documentListId,
    };
    const metaBytes = new TextEncoder().encode(JSON.stringify(metaObj));
    const encryptedMetaBytes = await encryptAESGCM(
      metaBytes.buffer,
      settingsKey,
    );
    const metadata = arrayBufferToStandardBase64(encryptedMetaBytes);

    output[name] = {
      documentId: user.email,
      metadata,
      sharedKey: {
        issuer: user.email,
        kid: "0",
        sharedKey: encryptedSharedKey,
      },
    };
  }

  const outputStr = `export const mockSettings = ${JSON.stringify(output, null, 2)};\n`;
  writeFileSync(
    resolve(process.cwd(), "tests/integration/mockSettings.ts"),
    outputStr,
  );
  console.log(
    "Done generating standard base64 settings mock using ORIGINAL keys!",
  );
}
main().catch(console.error);
