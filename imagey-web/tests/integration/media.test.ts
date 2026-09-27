import { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  aesGcmEncrypt,
  clearLocalStorage,
  encryptedDocument,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  loginAsMaryAt,
  routeGeneratedDocument,
  stubMobile,
  TestData,
} from "./setup";
import { ALICE_ID, LAURA_ID, MARY_ID } from "./testdata";
import { MAX_INLINE_MEDIA_BYTES } from "../../src/document/mediaTypes";

// The audio/video detail page (/media/:id, docs/plans/open-documents.md part
// B). Loading a folder/document/shared document is already covered by
// folder.test.ts/chat.test.ts's Pact contracts, so these tests serve
// generated fixtures via page.route and only verify the client's own
// behavior. Genuine video decoding needs a real, tiny video file - this repo
// has no ffmpeg locally to generate one, so the "plays successfully" case is
// exercised with a real WAV (trivial to build by hand) via the <audio>
// branch; the <video> branch is exercised with garbage bytes that
// legitimately fail to decode (the "unplayable" fallback), which still
// covers the video element wiring/guardrails.

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

const MARY = MARY_ID;
const LAURA = LAURA_ID;
const ALICE = ALICE_ID;
const ROOT_ID = TestData.mary.settings!.documents;
const CHATS_ID = TestData.mary.settings!.chats;
const ROOT_KEY = TestData.mary.documents[0].key!;
const CHAT_ID = "chat-laura-media";
const GROUP_ID = "77777777-7777-7777-7777-777777777002";
const FILE_ID = "44444444-4444-4444-4444-444444444444";
const CONTENT_ID = "55555555-5555-5555-5555-555555555555";
const FOLDER_ID = "66666666-6666-6666-6666-666666666666";

// A minimal, genuinely valid WAV file (8-bit PCM mono silence) - Chromium
// plays this without any external tooling.
function makeWavBuffer(durationSeconds = 0.5, sampleRate = 8000): Buffer {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + numSamples);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples, 40);
  buffer.fill(128, 44);
  return buffer;
}

async function routeContactRequests(page: Page) {
  await page.route(`**/users/${MARY}/contact-requests`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
}

async function routeFolderWithMedia(
  page: Page,
  {
    name,
    mimeType,
    parentId = ROOT_ID,
    parentKey = ROOT_KEY,
  }: {
    name: string;
    mimeType: string;
    parentId?: string;
    parentKey?: JsonWebKey;
  },
) {
  const fileKey = await generateAesGcmKeyJwk();
  await routeGeneratedDocument(
    page,
    parentId,
    await encryptedDocument(parentKey, {
      type: "folder",
      name: "Documents",
      documents: [
        {
          documentId: FILE_ID,
          name,
          type: "file",
          mimeType,
          sharedKey: {
            sharedKey: await encryptKeyEnvelope(fileKey, parentKey),
          },
        },
      ],
    }),
    parentId === ROOT_ID ? MARY : ROOT_ID,
    await encryptKeyEnvelope(parentKey, TestData.mary.settingsKey!),
  );
  return { fileKey };
}

async function routeMediaDocument(
  page: Page,
  {
    fileKey,
    name,
    mimeType,
    content,
    size,
    parentId = ROOT_ID,
    parentKey = ROOT_KEY,
  }: {
    fileKey: JsonWebKey;
    name: string;
    mimeType: string;
    content: Buffer;
    size?: number;
    parentId?: string;
    parentKey?: JsonWebKey;
  },
) {
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name,
      mimeType,
      size: size ?? content.length,
      contentId: CONTENT_ID,
    }),
    parentId,
    await encryptKeyEnvelope(fileKey, parentKey),
  );
  let requests = 0;
  await page.route(
    `**/users/${MARY}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    async (route) => {
      requests++;
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: await aesGcmEncrypt(fileKey, content),
      });
    },
  );
  return { contentRequests: () => requests };
}

async function routeChatSharingMedia(
  page: Page,
  {
    fileKey,
    name,
    mimeType,
    content,
  }: { fileKey: JsonWebKey; name: string; mimeType: string; content: Buffer },
) {
  const chatsKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();
  const settingsKey = TestData.mary.settingsKey!;

  await page.route(
    `**/users/${MARY}/documents/${ROOT_ID}/keys/${MARY}`,
    async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(ROOT_KEY, settingsKey) },
      }),
  );
  await routeGeneratedDocument(
    page,
    CHATS_ID,
    await encryptedDocument(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts: [
        {
          userId: LAURA,
          chatId: CHAT_ID,
          owner: MARY,
          name: "Laura",
          profileRevision: "0",
        },
      ],
    }),
    MARY,
    await encryptKeyEnvelope(chatsKey, settingsKey),
  );
  await routeGeneratedDocument(
    page,
    CHAT_ID,
    await encryptedDocument(chatKey, {
      type: "chat",
      name: "Chat",
      publicProfiles: {},
    }),
    CHATS_ID,
    await encryptKeyEnvelope(chatKey, chatsKey),
  );
  const { contentRequests } = await routeMediaDocument(page, {
    fileKey,
    name,
    mimeType,
    content,
  });

  const message = (
    await encryptedDocument(chatKey, {
      type: "shared-document",
      documentId: FILE_ID,
      owner: MARY,
    })
  ).toString("base64");
  await page.route(
    new RegExp(`/users/${MARY}/documents/${CHAT_ID}/messages`),
    (route) =>
      route.fulfill({
        status: 200,
        json: route.request().url().includes("sinceId")
          ? []
          : [{ id: "msg-1", sender: MARY, content: message }],
      }),
  );
  return { contentRequests };
}

// A group Alice owns, Mary is a member of (cached GroupEntry.groupKey, ADR
// 0019 decision 3), with one message sharing a playable `file` document -
// mirrors document.test.ts's routeGroupSharingFile. Group messages have no
// `contactUserId` (ConversationView's `group` prop path instead), so
// SharedDocumentMessage never offers the media detail page for them (only
// 1:1 chats do) - this fixture exists to prove exactly that: the group
// share falls back to download/share like any other file.
async function routeGroupSharingMedia(
  page: Page,
  {
    fileKey,
    name,
    mimeType,
    content,
  }: { fileKey: JsonWebKey; name: string; mimeType: string; content: Buffer },
) {
  const chatsKey = await generateAesGcmKeyJwk();
  const groupKey = await generateAesGcmKeyJwk();
  const settingsKey = TestData.mary.settingsKey!;

  await routeGeneratedDocument(
    page,
    CHATS_ID,
    await encryptedDocument(chatsKey, {
      type: "chatList",
      name: "Chats",
      contacts: [],
      groups: [{ groupId: GROUP_ID, owner: ALICE, name: "Team", groupKey }],
    }),
    MARY,
    await encryptKeyEnvelope(chatsKey, settingsKey),
  );
  const groupContent = await encryptedDocument(groupKey, {
    type: "group",
    name: "Team",
    members: [ALICE, MARY],
    publicProfiles: {},
  });
  await page.route(`**/users/${ALICE}/documents/${GROUP_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: groupContent,
    }),
  );

  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name,
      mimeType,
      size: content.length,
      contentId: CONTENT_ID,
    }),
    GROUP_ID,
    await encryptKeyEnvelope(fileKey, groupKey),
    ALICE,
  );
  await page.route(
    `**/users/${ALICE}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: await aesGcmEncrypt(fileKey, content),
      }),
  );

  const message = (
    await encryptedDocument(groupKey, {
      type: "shared-document",
      documentId: FILE_ID,
      owner: ALICE,
    })
  ).toString("base64");
  await page.route(
    new RegExp(`/users/${ALICE}/documents/${GROUP_ID}/messages`),
    (route) =>
      route.fulfill({
        status: 200,
        json: route.request().url().includes("sinceId")
          ? []
          : [{ id: "msg-1", sender: ALICE, content: message }],
      }),
  );
}

test("a video tile in a folder navigates to the media detail page", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "clip.webm",
    mimeType: "video/webm",
  });
  await routeMediaDocument(page, {
    fileKey,
    name: "clip.webm",
    mimeType: "video/webm",
    content: Buffer.from("not a real video"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("clip.webm").click();

  await expect(page).toHaveURL(`/media/${FILE_ID}?folder=${ROOT_ID}`);
  // Garbage bytes fail to decode almost immediately - the <video> element
  // itself is too transient to reliably inspect here (see the guardrail
  // checks on the stably-playing <audio> test below instead); what's
  // reliably observable is that it ends in the unplayable fallback.
  await expect(
    page.getByText("clip.webm cannot be played in the browser"),
  ).toBeVisible();
});

test("an audio tile in a folder plays back and goes back to the folder", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "sound.wav",
    mimeType: "audio/wav",
  });
  await routeMediaDocument(page, {
    fileKey,
    name: "sound.wav",
    mimeType: "audio/wav",
    content: makeWavBuffer(),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("sound.wav").click();

  await expect(page).toHaveURL(`/media/${FILE_ID}?folder=${ROOT_ID}`);
  const audio = page.locator("audio");
  await expect(audio).toBeVisible();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState))
    .toBeGreaterThanOrEqual(1);
  // Guardrails (docs/plans/open-documents.md "Warum Audio/Video ... unbedenklich
  // ist"): native player download hidden, no autoplay, no <track> from
  // document content.
  const guardrails = await audio.evaluate((el: HTMLAudioElement) => ({
    controlsList: el.getAttribute("controlslist"),
    autoplay: el.autoplay,
    trackCount: el.querySelectorAll("track").length,
  }));
  expect(guardrails).toEqual({
    controlsList: "nodownload",
    autoplay: false,
    trackCount: 0,
  });
  await expect(page.getByText("Error loading sound.wav")).toBeHidden();
  await expect(
    page.getByText("sound.wav cannot be played in the browser"),
  ).toBeHidden();
});

test("an unusual mimeType with parameters falls back to a generic blob type", async ({
  page,
}) => {
  // The bytes are genuinely valid WAV audio (same makeWavBuffer() as the
  // "plays back" test above) - Chromium plays it regardless of the blob's
  // declared type, so playability can't tell the branches apart. The
  // `;codecs=` parameter is what matters: sanitizedMediaType (pages/Media.tsx)
  // rejects it, so the Blob backing the <audio> element's src must carry
  // application/octet-stream, not the original mimeType - checked directly
  // via the blob: URL's own Content-Type (which mirrors Blob.type exactly),
  // since without this the fallback branch would be dead code the coverage
  // gate can't see exercised.
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "clip.wav",
    mimeType: "audio/wav;codecs=1",
  });
  await routeMediaDocument(page, {
    fileKey,
    name: "clip.wav",
    mimeType: "audio/wav;codecs=1",
    content: makeWavBuffer(),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("clip.wav").click();

  await expect(page).toHaveURL(`/media/${FILE_ID}?folder=${ROOT_ID}`);
  const audio = page.locator("audio");
  await expect(audio).toBeVisible();

  const contentType = await audio.evaluate(async (el: HTMLAudioElement) => {
    const response = await fetch(el.src);
    return response.headers.get("content-type");
  });
  expect(contentType).toBe("application/octet-stream");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("clip.wav");
});

test("a shared video in a 1:1 chat navigates without a metadata request and back goes to the chat", async ({
  page,
}) => {
  // The back button is only shown on small screens.
  await page.setViewportSize({ width: 412, height: 915 });
  const fileKey = await generateAesGcmKeyJwk();
  await routeChatSharingMedia(page, {
    fileKey,
    name: "clip.webm",
    mimeType: "video/webm",
    content: Buffer.from("not a real video"),
  });
  await routeContactRequests(page);

  let metadataRequests = 0;
  await page.route(`**/users/${MARY}/documents/${FILE_ID}`, (route) => {
    metadataRequests++;
    // Not route.continue() - that would send the request to the real
    // network. fallback() passes it to the previously-registered handler
    // (routeMediaDocument's mock), which is what should actually answer it.
    route.fallback();
  });

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Chats" }).first().click();
  await page.getByText("Laura", { exact: true }).first().click();
  await expect(page.getByLabel("clip.webm")).toBeVisible();
  // SharedDocumentMessage's own render already made exactly one metadata
  // request (to tell file from image); clicking into the media page must not
  // add a second one - it's registered via registerDetail instead.
  const requestsBeforeClick = metadataRequests;
  await page.getByLabel("clip.webm").click();

  await expect(page).toHaveURL(`/media/${FILE_ID}?chat=${LAURA}&owner=${MARY}`);
  await expect(
    page.getByText("clip.webm cannot be played in the browser"),
  ).toBeVisible();
  expect(metadataRequests).toBe(requestsBeforeClick);

  await page.getByLabel("back-button").click();
  await expect(page).toHaveURL(`/chats/${LAURA}`);
});

test("a shared video in a group chat does not open the media page and downloads instead", async ({
  page,
}) => {
  const fileKey = await generateAesGcmKeyJwk();
  await routeGroupSharingMedia(page, {
    fileKey,
    name: "clip.webm",
    mimeType: "video/webm",
    content: Buffer.from("not a real video"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Chats" }).first().click();
  await page.getByText("Team", { exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("clip.webm")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("clip.webm").click(),
  ]);
  expect(download.suggestedFilename()).toBe("clip.webm");
  // Never navigated to the media detail page - group messages don't support
  // it yet (ADR 0019), same as images.
  await expect(page).not.toHaveURL(/\/media\//);
});

test("deep link into a folder-resolved media page after a reload", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "sound.wav",
    mimeType: "audio/wav",
  });
  await routeMediaDocument(page, {
    fileKey,
    name: "sound.wav",
    mimeType: "audio/wav",
    content: makeWavBuffer(),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, `/media/${FILE_ID}?folder=${ROOT_ID}`);

  await expect(page.locator("audio")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("No file found")).toBeHidden();
});

test("a media deep link into an unresolvable sub-folder shows no file found", async ({
  page,
}) => {
  await routeContactRequests(page);
  await loginAsMaryAt(page, `/media/${FILE_ID}?folder=${FOLDER_ID}`);

  await expect(page.getByText("No file found")).toBeVisible();
});

test("a non-media document behind a media link shows no file found", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "note.txt",
    mimeType: "text/plain",
  });
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name: "note.txt",
      mimeType: "text/plain",
      size: 1,
      contentId: CONTENT_ID,
    }),
    ROOT_ID,
    await encryptKeyEnvelope(fileKey, ROOT_KEY),
  );
  await routeContactRequests(page);

  await loginAsMaryAt(page, `/media/${FILE_ID}?folder=${ROOT_ID}`);

  await expect(page.getByText("No file found")).toBeVisible();
});

test("a file over the size limit is not fetched and offers a download fallback", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "huge.webm",
    mimeType: "video/webm",
  });
  const { contentRequests } = await routeMediaDocument(page, {
    fileKey,
    name: "huge.webm",
    mimeType: "video/webm",
    content: Buffer.from("tiny actual bytes"),
    size: MAX_INLINE_MEDIA_BYTES + 1,
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("huge.webm").click();

  await expect(page.getByText("huge.webm is too large to play")).toBeVisible();
  expect(contentRequests()).toBe(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("huge.webm");
  expect(contentRequests()).toBe(1);
});

test("an unplayable video's fallback downloads without a second content request", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "broken.mp4",
    mimeType: "video/mp4",
  });
  const { contentRequests } = await routeMediaDocument(page, {
    fileKey,
    name: "broken.mp4",
    mimeType: "video/mp4",
    content: Buffer.from("this is text, not an mp4"),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("broken.mp4").click();

  await expect(
    page.getByText("broken.mp4 cannot be played in the browser"),
  ).toBeVisible();
  // The initial playback attempt's own effect already loaded the content
  // (React StrictMode's dev-only double-invoke means this baseline is 2, not
  // 1, here - production doesn't double-invoke). What matters is that the
  // fallback button below reuses it instead of loading it again.
  const requestsBeforeDownload = contentRequests();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("broken.mp4");
  expect(contentRequests()).toBe(requestsBeforeDownload);
});

test("the app-bar download action downloads the original file", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "sound.wav",
    mimeType: "audio/wav",
  });
  await routeMediaDocument(page, {
    fileKey,
    name: "sound.wav",
    mimeType: "audio/wav",
    content: makeWavBuffer(),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("sound.wav").click();
  await expect(page.locator("audio")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("sound.wav");
});

test("mobile app-bar download action shares instead of downloading", async ({
  page,
}) => {
  await stubMobile(page, { coarse: true, share: "ok" });
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "sound.wav",
    mimeType: "audio/wav",
  });
  await routeMediaDocument(page, {
    fileKey,
    name: "sound.wav",
    mimeType: "audio/wav",
    content: makeWavBuffer(),
  });
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("sound.wav").click();
  await expect(page.locator("audio")).toBeVisible();

  await page.getByLabel("download").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __shared?: unknown[] }).__shared?.length ?? 0,
      ),
    )
    .toBe(1);
});

test("a content load error shows the standard error message", async ({
  page,
}) => {
  const { fileKey } = await routeFolderWithMedia(page, {
    name: "clip.webm",
    mimeType: "video/webm",
  });
  await routeGeneratedDocument(
    page,
    FILE_ID,
    await encryptedDocument(fileKey, {
      type: "file",
      name: "clip.webm",
      mimeType: "video/webm",
      size: 1,
      contentId: CONTENT_ID,
    }),
    ROOT_ID,
    await encryptKeyEnvelope(fileKey, ROOT_KEY),
  );
  await page.route(
    `**/users/${MARY}/documents/${FILE_ID}/files/${CONTENT_ID}`,
    (route) => route.fulfill({ status: 404 }),
  );
  await routeContactRequests(page);

  await loginAsMaryAt(page, "/");
  await page.getByRole("link", { name: "Images" }).first().click();
  await page.getByLabel("clip.webm").click();

  await expect(page.getByText("Error loading clip.webm")).toBeVisible();
});
