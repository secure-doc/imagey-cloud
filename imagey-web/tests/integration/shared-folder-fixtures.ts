import * as fs from "fs";
import type { Page } from "@playwright/test";

import {
  aesGcmEncrypt,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  inputMarysPassword,
  routeMarysAuth,
  setupMarysDevice,
  TestData,
  ALICE_ID,
  MARY_ID,
} from "./setup";

// Browsing a folder alice shared with mary, served from fixtures generated here (the contract of
// the calls is carried by share-folder.test.ts): the shared page lists it, its sub-folder, image,
// file and video open as alice's documents, and a reload finds it again through the chats
// document.

export const TRIP = "5a1c0000-0000-4000-8000-0000000000a1";
export const DAY_1 = "5a1c0000-0000-4000-8000-0000000000a2";
export const PICTURE = "5a1c0000-0000-4000-8000-0000000000a3";
export const NOTES = "5a1c0000-0000-4000-8000-0000000000a4";
export const CLIP = "5a1c0000-0000-4000-8000-0000000000a5";

export const json = (value: object) =>
  new TextEncoder().encode(JSON.stringify(value));

// The Access-Path headers the picture was requested with.
export const accessPaths: (string | undefined)[] = [];

export async function serveSharedTrip(
  page: Page,
  contributions: boolean,
): Promise<{ chatsKey: JsonWebKey }> {
  accessPaths.length = 0;
  const chatsId = TestData.mary.settings!.chats;
  const chatsKey = await generateAesGcmKeyJwk();
  const tripKey = await generateAesGcmKeyJwk();
  const day1Key = await generateAesGcmKeyJwk();
  const pictureKey = await generateAesGcmKeyJwk();
  const notesKey = await generateAesGcmKeyJwk();
  const clipKey = await generateAesGcmKeyJwk();
  const entry = async (
    documentId: string,
    type: string,
    name: string,
    key: JsonWebKey,
    extra: object = {},
  ) => ({
    documentId,
    name,
    type,
    ...extra,
    sharedKey: { sharedKey: await encryptKeyEnvelope(key, tripKey) },
  });

  const chats = await aesGcmEncrypt(
    chatsKey,
    json({
      type: "chatList",
      name: "Chats",
      contacts: [],
      groups: [],
      sharedFolders: [
        {
          documentId: TRIP,
          owner: ALICE_ID,
          name: "Trip",
          folderKey: tripKey,
          contributions,
        },
      ],
    }),
  );
  const serve = (pattern: string, body: Buffer, etag?: string) =>
    page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        headers: etag ? { ETag: etag } : {},
        body,
      }),
    );

  await page.route(`**/users/${MARY_ID}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await serve(`**/users/${MARY_ID}/documents/${chatsId}`, chats);
  await page.route(
    `**/users/${MARY_ID}/documents/${chatsId}/keys/${MARY_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: {
          sharedKey: await encryptKeyEnvelope(
            chatsKey,
            TestData.mary.settingsKey!,
          ),
        },
      }),
  );

  const picture = fs.readFileSync("tests/images/beach-4524911_480.jpg");
  await serve(
    `**/users/${ALICE_ID}/documents/${TRIP}`,
    await aesGcmEncrypt(
      tripKey,
      json({
        documentId: TRIP,
        name: "Trip",
        type: "folder",
        documents: [
          await entry(DAY_1, "folder", "Day 1", day1Key),
          await entry(PICTURE, "image", "pic.jpg", pictureKey, {
            mimeType: "image/jpeg",
            mediumImageId: "medium",
          }),
          await entry(NOTES, "file", "notes.txt", notesKey, {
            mimeType: "text/plain",
          }),
          await entry(CLIP, "file", "clip.mp4", clipKey, {
            mimeType: "video/mp4",
          }),
        ],
      }),
    ),
    '"trip-etag"',
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${DAY_1}`,
    await aesGcmEncrypt(
      day1Key,
      json({ documentId: DAY_1, name: "Day 1", type: "folder", documents: [] }),
    ),
  );
  const mediumImage = await aesGcmEncrypt(pictureKey, picture);
  await page.route(
    `**/users/${ALICE_ID}/documents/${PICTURE}/files/medium`,
    (route) => {
      accessPaths.push(route.request().headers()["access-path"]);
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: mediumImage,
      });
    },
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${PICTURE}`,
    await aesGcmEncrypt(
      pictureKey,
      json({
        type: "image",
        name: "pic.jpg",
        mimeType: "image/jpeg",
        size: picture.length,
        contentId: "original",
        smallImageId: "small",
        mediumImageId: "medium",
      }),
    ),
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${NOTES}`,
    await aesGcmEncrypt(
      notesKey,
      json({
        type: "file",
        name: "notes.txt",
        mimeType: "text/plain",
        size: 5,
        contentId: "notes-content",
      }),
    ),
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${NOTES}/files/notes-content`,
    await aesGcmEncrypt(notesKey, Buffer.from("hello")),
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${CLIP}`,
    await aesGcmEncrypt(
      clipKey,
      json({
        type: "file",
        name: "clip.mp4",
        mimeType: "video/mp4",
        size: 5,
        contentId: "clip-content",
      }),
    ),
  );
  return { chatsKey };
}

export async function loginAt(page: Page, path: string) {
  await setupMarysDevice(page);
  await routeMarysAuth(page);
  await page.goto(path);
  await inputMarysPassword(page);
}

// Minimal multipart/form-data splitter - just enough to pull the named parts out of an upload.
export function parseMultipart(
  body: Buffer,
  contentType: string,
): Map<string, Buffer> {
  const boundary = `--${contentType.match(/boundary=(.+)$/)![1]}`;
  const parts = new Map<string, Buffer>();
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.subarray(start + boundary.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    const name = part
      .subarray(0, headerEnd)
      .toString("utf8")
      .match(/name="([^"]+)"/);
    if (name) {
      parts.set(name[1], part.subarray(headerEnd + 4, part.length - 2));
    }
    start = next;
  }
  return parts;
}
