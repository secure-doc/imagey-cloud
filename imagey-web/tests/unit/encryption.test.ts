import { expect, test, vi } from "vitest";
import { authenticationRepository } from "../../src/authentication/AuthenticationRepository";
import { Email } from "../../src/contexts/AuthenticationContext";
import { deviceRepository } from "../../src/device/DeviceRepository";
import { deviceService } from "../../src/device/DeviceService";
import { documentRepository } from "../../src/document/DocumentRepository";
import { documentService } from "../../src/document/DocumentService";
import { imageService } from "../../src/image/ImageService";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { marysPrivateMainKey } from "../integration/setup";

import {
  device1KeyPair,
  deviceId1,
  encryptedMainKey,
  mainKeyPair,
  marysEmail,
  marysPassword,
} from "./setup";
import DocumentMetadata from "../../src/document/DocumentMetadata";

test("Unlock device", async () => {
  const mockResults = registerSpiesToUnlockDevice();

  // Given: register first device
  await deviceService.registerDevice(marysEmail, marysPassword);
  deviceRepository.storeDeviceId(marysEmail, deviceId1);

  // When: activate second device
  await deviceService.activateDevice(
    marysEmail,
    mockResults.deviceId2,
    mainKeyPair.privateKey,
    device1KeyPair.privateKey,
  );

  // Then: unlock second device
  deviceRepository.storeDeviceId(marysEmail, mockResults.deviceId2);
  const keys = await deviceService.unlockDevice(marysEmail, marysPassword);

  expect(keys.privateMainKey).toEqual(mainKeyPair.privateKey);

  expect(authenticationRepository.storePrivateMainKey).toHaveBeenCalled();
  expect(mockResults.device2EncryptedPrivateMainKey).not.toBe("");
});

test("Store document", async () => {
  // Given
  registerSpiesToStoreDocument();
  const helloWorld =
    "Hello world                                                                                  ";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const file: File = {
    lastModified: 0,
    name: "hello.txt",
    webkitRelativePath: "",
    size: helloWorld.length,
    type: "txt",
    arrayBuffer: function (): Promise<ArrayBuffer> {
      return Promise.resolve(encoder.encode(helloWorld).buffer);
    },
  } as File;

  // When
  const documentMetadata = await documentService.storeDocument(
    marysEmail,
    file,
    mainKeyPair.publicKey,
    mainKeyPair.privateKey,
  );

  // Then
  const document = await documentService.loadDocument(
    marysEmail,
    documentMetadata,
    mainKeyPair.publicKey,
    mainKeyPair.privateKey,
  );

  const content = decoder.decode(document.content);
  expect(content).toBe(helloWorld);
});

test("Store document to disk", async () => {
  // Given
  registerSpiesToStoreDocumentToDisk();
  const imageFile = await readFile(
    resolve("tests/images", "beach-1836467_1920.jpg"),
  );
  const arrayBuffer = imageFile.buffer.slice(
    imageFile.byteOffset,
    imageFile.byteOffset + imageFile.byteLength,
  );
  const file = new File([arrayBuffer], "beach-1836467_1920.jpg", {
    type: "image/jpg",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => arrayBuffer,
  });

  vi.spyOn(imageService, "scale").mockResolvedValue({
    smallImage: arrayBuffer,
    normalImage: arrayBuffer,
  });

  // When
  const documentMetadata = await documentService.storeDocument(
    marysEmail,
    file,
    mainKeyPair.publicKey,
    marysPrivateMainKey,
  );

  expect(documentMetadata).toBeDefined();
  // Then
  /*
  const document = await documentService.loadDocument(
    marysEmail,
    documentMetadata,
    mainKeyPair.privateKey,
  );

  const content = decoder.decode(document.content);
  expect(content).toBe(helloWorld);
  */
});

const deviceKeys: Record<string, string> = {
  [deviceId1]: encryptedMainKey,
};

function registerSpiesToUnlockDevice(): {
  deviceId2: string;
  device2PublicKey: JsonWebKey;
  device2EncryptedPrivateMainKey: string;
} {
  const mockResults = {
    deviceId2: "device-2",
    device2PublicKey: {} as JsonWebKey,
    device2EncryptedPrivateMainKey: "",
  };

  vi.spyOn(authenticationRepository, "storePublicDeviceKey").mockImplementation(
    async (email, deviceId, publicKey) => {
      mockResults.deviceId2 = deviceId;
      mockResults.device2PublicKey = publicKey;
    },
  );

  vi.spyOn(authenticationRepository, "loadPublicDeviceKey").mockImplementation(
    async (_email, deviceId) =>
      deviceId === deviceId1
        ? device1KeyPair.publicKey
        : mockResults.device2PublicKey,
  );

  vi.spyOn(authenticationRepository, "storePrivateMainKey").mockImplementation(
    async (email, encryptingDeviceId, receivingDeviceId, encryptedKey) => {
      deviceKeys[receivingDeviceId] = encryptedKey;
      mockResults.device2EncryptedPrivateMainKey = encryptedKey;
    },
  );

  vi.spyOn(authenticationRepository, "loadPrivateMainKey").mockImplementation(
    async (email: Email, deviceId: string) => {
      const key = deviceKeys[deviceId];
      if (!key) throw new Error("Private Key missing"); // klarer Fehler
      return {
        kid: "0",
        encryptingDeviceId:
          deviceId === deviceId1 ? mockResults.deviceId2 : deviceId1,
        key,
      };
    },
  );

  return mockResults;
}

function registerSpiesToStoreDocument() {
  let encryptedDocumentKey = "";
  let encryptedDocumentContent: ArrayBuffer[] = [];
  vi.spyOn(authenticationRepository, "loadPublicMainKey").mockImplementation(
    async () => mainKeyPair.publicKey,
  );
  vi.spyOn(documentRepository, "uploadDocument").mockImplementation(
    async (
      email: string,
      metadata: DocumentMetadata,
      sharedKey: string,
      content: ArrayBuffer[],
    ) => {
      encryptedDocumentKey = sharedKey;
      encryptedDocumentContent = content;
    },
  );
  vi.spyOn(documentRepository, "loadContent").mockImplementation(async () => {
    return encryptedDocumentContent[0];
  });
  vi.spyOn(documentRepository, "loadKey").mockImplementation(async () => {
    return encryptedDocumentKey;
  });
}

function registerSpiesToStoreDocumentToDisk() {
  let encryptedDocumentKey = "";
  let encryptedDocumentContent: ArrayBuffer[] = [];
  vi.spyOn(authenticationRepository, "loadPublicMainKey").mockImplementation(
    async () => mainKeyPair.publicKey,
  );
  vi.spyOn(documentRepository, "uploadDocument").mockImplementation(
    async (
      email: string,
      metadata: DocumentMetadata,
      sharedKey: string,
      content: ArrayBuffer[],
    ) => {
      encryptedDocumentKey = sharedKey;
      writeFile(metadata.documentId, Buffer.from(content[0]));
      if (metadata.smallImageId) {
        writeFile(metadata.smallImageId, Buffer.from(content[1]));
      }
      if (metadata.previewImageId) {
        writeFile(metadata.previewImageId, Buffer.from(content[2]));
      }
      encryptedDocumentContent = content;
    },
  );
  vi.spyOn(documentRepository, "loadContent").mockImplementation(async () => {
    return encryptedDocumentContent[0];
  });
  vi.spyOn(documentRepository, "loadKey").mockImplementation(async () => {
    return encryptedDocumentKey;
  });
}
