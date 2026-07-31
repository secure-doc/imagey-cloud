import { TestData } from "../tests/integration/testdata.ts";
import {
  encryptAESGCM,
  encryptKey,
  arrayBufferToBase64,
  decryptPrivatePasswordKey,
  decryptKey,
} from "./cryptoHelper.ts";
import { writeFileSync } from "fs";
import { resolve } from "path";

async function generateMocks() {
  const users = ["mary", "alice", "laura", "bill"];
  const mocks: any = {};

  for (const user of users) {
    const userData = (TestData as any)[user];
    let privateMainKey = userData.privateMainKey;
    const publicMainKey = userData.publicMainKey;

    if (!privateMainKey && userData.password && userData.devices.length > 0) {
      const device = userData.devices[0];
      const privateDeviceKey = await decryptPrivatePasswordKey(
        device.encryptedPrivateDeviceKey,
        userData.password,
      );
      privateMainKey = await decryptKey(
        device.encryptedPrivateMainKey,
        privateDeviceKey,
        device.publicDeviceKey,
      );
      console.log(`Decrypted privateMainKey for ${user}`);
    }

    mocks[user] = {};

    const createEncryptedDocument = async (payloadObj: any) => {
      // 1. Generate Symmetric Key
      const symKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );
      const symJwk = await crypto.subtle.exportKey("jwk", symKey);

      // 2. Encrypt Payload
      const payloadString = JSON.stringify(payloadObj);
      const payloadBuffer = new TextEncoder().encode(payloadString).buffer;
      const encryptedPayloadBuffer = await encryptAESGCM(payloadBuffer, symKey);
      const metadata = arrayBufferToBase64(encryptedPayloadBuffer);

      // 3. Encrypt Symmetric Key
      const encryptedSharedKey = await encryptKey(
        symJwk,
        privateMainKey,
        publicMainKey,
      );

      return {
        metadata,
        sharedKey: encryptedSharedKey,
      };
    };

    // Root Folder
    const rootFolderPayload: any = {};
    if (user === "mary") {
      rootFolderPayload.children = [
        "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
        "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
      ];
    }
    mocks[user].rootFolder = await createEncryptedDocument(rootFolderPayload);

    // Chat Folder
    const chatFolderPayload: any = {};
    mocks[user].chatFolder = await createEncryptedDocument(chatFolderPayload);

    // Profile
    const profilePayload = {
      name: user.charAt(0).toUpperCase() + user.slice(1),
    };
    mocks[user].profile = await createEncryptedDocument(profilePayload);

    // Profile Pic
    const profilePicPayload = { type: "image/jpeg" };
    mocks[user].profilePic = await createEncryptedDocument(profilePicPayload);

    // Chats
    mocks[user].chats = {};
    if (userData.chats) {
      for (const chat of userData.chats) {
        const chatEmail = chat.contactEmail;
        const chatPayload = { contactEmail: chatEmail };
        mocks[user].chats[chatEmail] =
          await createEncryptedDocument(chatPayload);
      }
    }
  }

  const outputPath = resolve(
    process.cwd(),
    "./tests/integration/mockDocuments.ts",
  );
  const tsContent = `export const mockDocuments = ${JSON.stringify(mocks, null, 2)};\n`;
  writeFileSync(outputPath, tsContent);
  console.log(`Wrote mocks to ${outputPath}`);
}

generateMocks().catch(console.error);
