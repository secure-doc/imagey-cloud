import * as fs from "fs";
import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  clearLocalStorage,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  TestData,
  ALICE_ID,
  MARY_ID,
} from "./setup";
import {
  json,
  loginAt,
  parseMultipart,
  serveSharedTrip,
  TRIP,
} from "./shared-folder-fixtures";

// Contributions (docs/plans/share-folders.md phase 2): mary adds to a folder alice shared with
// contributions, and reads what alice contributed to a folder of her own.

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

interface Upload {
  metadata: {
    folderOwner: string;
    folderId: string;
    documentId: string;
    key: { issuer: string; kid: string };
  };
  accessPath?: string;
}

// Answers the uploads mary makes into alice's folder with `status` and records them.
async function acceptUploads(page: Page, status: number): Promise<Upload[]> {
  const uploads: Upload[] = [];
  await page.route(
    new RegExp(`/users/${MARY_ID}/documents$`),
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.fallback();
      }
      const parts = parseMultipart(
        request.postDataBuffer()!,
        request.headers()["content-type"],
      );
      uploads.push({
        metadata: JSON.parse(parts.get("metadata")!.toString("utf8")),
        accessPath: request.headers()["access-path"],
      });
      return route.fulfill({
        status,
        headers:
          status === 201
            ? {
                Location: `/users/${MARY_ID}/documents/new`,
                ETag: '"trip-after"',
                "Access-Control-Expose-Headers": "Location, ETag",
              }
            : {},
      });
    },
  );
  return uploads;
}

test("mary adds an image to a folder alice shared with contributions", async ({
  page,
}) => {
  await serveSharedTrip(page, true);
  const uploads = await acceptUploads(page, 201);
  await loginAt(page, "/shared");
  await page.getByAltText("Trip").click();

  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
  await page.locator("*[aria-label='add-menu']").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Upload Document").click();
  await (await chooser).setFiles("tests/images/beach-4524911_480.jpg");

  // The document lands in mary's tree, its key is issued by the owner of the folder.
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0].metadata).toMatchObject({
    folderOwner: ALICE_ID,
    folderId: TRIP,
    key: { issuer: ALICE_ID, kid: TRIP },
  });
  // The shared folder is a direct grant of mary: no chain needed.
  expect(uploads[0].accessPath).toBeUndefined();
});

test("a contribution that alice no longer takes is reported, and nothing more is offered", async ({
  page,
}) => {
  const { chatsKey } = await serveSharedTrip(page, true);
  await acceptUploads(page, 403);
  // What is told to the "chats" document about it.
  const written: Buffer[] = [];
  await page.route(
    `**/users/${MARY_ID}/documents/${TestData.mary.settings!.chats}`,
    (route) => {
      if (route.request().method() !== "PUT") {
        return route.fallback();
      }
      written.push(route.request().postDataBuffer()!);
      return route.fulfill({ status: 204, headers: { ETag: '"chats-2"' } });
    },
  );
  await loginAt(page, "/shared");
  await page.getByAltText("Trip").click();
  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();

  await page.locator("*[aria-label='add-menu']").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Upload Document").click();
  await (await chooser).setFiles("tests/images/beach-4524911_480.jpg");

  await expect(
    page.getByText("You can no longer add anything to this folder."),
  ).toBeVisible();
  await expect(page.locator("*[aria-label='add-menu']")).toHaveCount(0);

  // The entry of "Shared with me" learns it too, so it is right in the next session as well.
  await expect.poll(() => written.length).toBe(1);
  const chats = JSON.parse(
    (await aesGcmDecrypt(chatsKey, written[0])).toString("utf8"),
  );
  expect(chats.sharedFolders).toMatchObject([
    { documentId: TRIP, contributions: false },
  ]);
});

for (const chatsStatus of [204, 500]) {
  test(`a refusal in a sub-folder withdraws the share's right (the chats document answers ${chatsStatus})`, async ({
    page,
  }) => {
    const { chatsKey } = await serveSharedTrip(page, true);
    await acceptUploads(page, 403);
    const written: Buffer[] = [];
    await page.route(
      `**/users/${MARY_ID}/documents/${TestData.mary.settings!.chats}`,
      (route) => {
        if (route.request().method() !== "PUT") {
          return route.fallback();
        }
        written.push(route.request().postDataBuffer()!);
        return route.fulfill({
          status: chatsStatus,
          headers: { ETag: '"chats-2"' },
        });
      },
    );
    await loginAt(page, "/shared");
    await page.getByAltText("Trip").click();
    await page.getByAltText("Day 1").click({ force: true });
    await expect(page.locator("button.circle.extra")).toBeVisible();

    const chooser = page.waitForEvent("filechooser");
    await page.locator("button.circle.extra").click();
    await (await chooser).setFiles("tests/images/beach-4524911_480.jpg");

    await expect(
      page.getByText("You can no longer add anything to this folder."),
    ).toBeVisible();
    await expect.poll(() => written.length).toBe(1);
    if (chatsStatus === 204) {
      const chats = JSON.parse(
        (await aesGcmDecrypt(chatsKey, written[0])).toString("utf8"),
      );
      // The entry is the one of the shared folder, not of the sub-folder.
      expect(chats.sharedFolders).toMatchObject([
        { documentId: TRIP, contributions: false },
      ]);
    }
  });
}

test("a folder mary creates in a shared folder needs nothing more: the right covers everything below", async ({
  page,
}) => {
  await serveSharedTrip(page, true);
  const uploads = await acceptUploads(page, 201);
  const rights: string[] = [];
  await page.route(
    `**/users/${MARY_ID}/documents/*/contributions/**`,
    (route) => {
      rights.push(route.request().url());
      return route.fulfill({ status: 204 });
    },
  );
  await loginAt(page, "/shared");
  await page.getByAltText("Trip").click();
  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();

  await page.locator("*[aria-label='add-menu']").click();
  await page.getByText("Create Folder").click();
  await page.getByRole("textbox").fill("Mine");
  await page.getByRole("button", { name: "Create" }).click();

  await expect.poll(() => uploads.length).toBe(1);
  expect(rights).toEqual([]);
});

// --- the owner reads what alice contributed -----------------------------------------------

const VACATION = "5a1c0000-0000-4000-8000-0000000000c1";
const ALICES_IMAGE = "5a1c0000-0000-4000-8000-0000000000c2";
const ALICES_FOLDER = "5a1c0000-0000-4000-8000-0000000000c3";

test("mary reads what alice contributed to her own folder", async ({
  page,
}) => {
  const settings = TestData.mary.settings!;
  const rootKey = await generateAesGcmKeyJwk();
  const vacationKey = await generateAesGcmKeyJwk();
  const imageKey = await generateAesGcmKeyJwk();
  const folderKey = await generateAesGcmKeyJwk();
  const seen: Record<string, string | undefined> = {};
  const serve = (pattern: string, body: Buffer, record?: string) =>
    page.route(pattern, (route) => {
      if (record) {
        seen[record] = route.request().headers()["access-path"];
      }
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body,
      });
    });
  const keyOf = (pattern: string, key: JsonWebKey, wrappedBy: JsonWebKey) =>
    page.route(pattern, async (route) =>
      route.fulfill({
        status: 200,
        json: { sharedKey: await encryptKeyEnvelope(key, wrappedBy) },
      }),
    );

  await serve(
    `**/users/${MARY_ID}/documents/${settings.documents}`,
    await aesGcmEncrypt(
      rootKey,
      json({
        name: "Documents",
        type: "folder",
        documents: [
          {
            documentId: VACATION,
            name: "Vacation",
            type: "folder",
            sharedKey: {
              sharedKey: await encryptKeyEnvelope(vacationKey, rootKey),
            },
          },
        ],
      }),
    ),
  );
  await keyOf(
    `**/users/${MARY_ID}/documents/${settings.documents}/keys/${MARY_ID}`,
    rootKey,
    TestData.mary.settingsKey!,
  );
  await serve(
    `**/users/${MARY_ID}/documents/${VACATION}`,
    await aesGcmEncrypt(
      vacationKey,
      json({
        name: "Vacation",
        type: "folder",
        documents: [
          {
            documentId: ALICES_IMAGE,
            owner: ALICE_ID,
            name: "alice.jpg",
            type: "image",
            mimeType: "image/jpeg",
            mediumImageId: "medium",
            sharedKey: {
              sharedKey: await encryptKeyEnvelope(imageKey, vacationKey),
            },
          },
          {
            documentId: ALICES_FOLDER,
            owner: ALICE_ID,
            name: "Alices",
            type: "folder",
            sharedKey: {
              sharedKey: await encryptKeyEnvelope(folderKey, vacationKey),
            },
          },
        ],
      }),
    ),
  );
  await keyOf(
    `**/users/${MARY_ID}/documents/${VACATION}/keys/${settings.documents}`,
    vacationKey,
    rootKey,
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${ALICES_IMAGE}/files/medium`,
    await aesGcmEncrypt(
      imageKey,
      fs.readFileSync("tests/images/beach-4524911_480.jpg"),
    ),
    "image",
  );
  await serve(
    `**/users/${ALICE_ID}/documents/${ALICES_FOLDER}`,
    await aesGcmEncrypt(
      folderKey,
      json({ name: "Alices", type: "folder", documents: [] }),
    ),
    "folder",
  );
  await loginAt(page, "/images");

  await page.getByAltText("Vacation").click({ force: true });
  // Alice's contributions are read through the folder, which mary owns (the terminus).
  await expect.poll(() => seen.image).toBeDefined();
  const chain = (header: string | undefined) =>
    JSON.parse(Buffer.from(header!, "base64url").toString("utf8")).chain;
  expect(chain(seen.image)).toEqual([
    { doc: ALICES_IMAGE, owner: ALICE_ID, wrappedBy: VACATION },
    { doc: VACATION, owner: MARY_ID, wrappedBy: VACATION },
  ]);

  // Alice's sub-folder is read in alice's tree with the same kind of chain; as it is open for
  // contributions, mary may add to it.
  await page.getByAltText("Alices").click({ force: true });
  await expect(page.locator("button.circle.extra")).toBeVisible();
  expect(chain(seen.folder)).toEqual([
    { doc: ALICES_FOLDER, owner: ALICE_ID, wrappedBy: VACATION },
    { doc: VACATION, owner: MARY_ID, wrappedBy: VACATION },
  ]);
});
