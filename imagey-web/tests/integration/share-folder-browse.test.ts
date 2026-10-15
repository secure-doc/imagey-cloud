import { test, expect } from "./fixtures";
import { clearLocalStorage, ALICE_ID, MARY_ID, TestData } from "./setup";
import {
  accessPaths,
  CLIP,
  loginAt,
  PICTURE,
  serveSharedTrip,
  TRIP,
} from "./shared-folder-fixtures";

// Browsing a folder alice shared with mary, served from fixtures generated in
// shared-folder-fixtures.ts (the contract of the calls is carried by share-folder.test.ts): the
// shared page lists it, its sub-folder, image, file and video open as alice's documents, and a
// reload finds it again through the chats document.

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("mary browses a read-only folder alice shared with her", async ({
  page,
}) => {
  await serveSharedTrip(page, false);
  await loginAt(page, "/shared");

  await page.getByAltText("Trip").click();
  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
  await expect(page.locator("*[aria-label='add-menu']")).toHaveCount(0);

  // The file is downloaded from alice's tree.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "notes.txt" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("notes.txt");

  // The video opens on the media page.
  await page.getByRole("button", { name: "clip.mp4" }).click();
  await expect(page).toHaveURL(new RegExp(`/media/${CLIP}`));
  await page.goBack();

  // A child of the shared folder is read with its own chain: the child, then the folder (a
  // direct grant of the receiver).
  expect(accessPaths.length).toBeGreaterThan(0);
  const chain = JSON.parse(
    Buffer.from(accessPaths[0]!, "base64url").toString("utf8"),
  ).chain;
  expect(chain).toEqual([
    { doc: PICTURE, owner: ALICE_ID, wrappedBy: TRIP },
    { doc: TRIP, owner: ALICE_ID, wrappedBy: TRIP },
  ]);

  // The image opens on the detail page, which keeps working with what the folder knew.
  await page.getByAltText("pic.jpg").click();
  await expect(page).toHaveURL(new RegExp(`/images/${PICTURE}`));
  await expect(page.getByAltText("pic.jpg")).toBeVisible();
  await page.goBack();

  // The sub-folder is empty and read-only too.
  await page.getByAltText("Day 1").click({ force: true });
  await expect(page.getByText("This folder is empty.")).toBeVisible();
  await page.getByRole("button", { name: "back-button" }).click();
  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
});

test("a reload of a shared folder finds it again through the chats document", async ({
  page,
}) => {
  await serveSharedTrip(page, true);
  await loginAt(page, `/documents/${TRIP}`);

  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
  // Shared with contributions: adding is offered (the server decides on every upload).
  await expect(page.locator("*[aria-label='add-menu']")).toBeVisible();
  // A folder of somebody else cannot be shared on.
  await page.locator("*[aria-label='add-menu']").click();
  await expect(page.getByText("Share folder", { exact: true })).toHaveCount(0);
});

test("a folder that is not shared with mary is not found through the chats document", async ({
  page,
}) => {
  await serveSharedTrip(page, false);
  await loginAt(page, "/documents/5a1c0000-0000-4000-8000-0000000000ff");

  // Nothing is known about it: it is not shown, and the way back is offered.
  await expect(
    page.getByText("This folder cannot be opened directly."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open your folders" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "notes.txt" })).toHaveCount(0);
});

test("a shared folder that cannot be loaded is reported, not shown as empty", async ({
  page,
}) => {
  await serveSharedTrip(page, true);
  await page.route(`**/users/${ALICE_ID}/documents/${TRIP}`, (route) =>
    route.fulfill({ status: 500 }),
  );
  await loginAt(page, `/documents/${TRIP}`);

  await expect(page.getByText("Could not load this folder.")).toBeVisible();
  await expect(page.locator("button.circle.extra")).toHaveCount(0);
});

test("a shared folder that cannot be decrypted is reported", async ({
  page,
}) => {
  await serveSharedTrip(page, true);
  await page.route(`**/users/${ALICE_ID}/documents/${TRIP}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: Buffer.from("not decryptable with the folder key"),
    }),
  );
  await loginAt(page, `/documents/${TRIP}`);

  await expect(page.getByText("Could not load this folder.")).toBeVisible();
});

test("a folder is not called unreachable when the chats document cannot be loaded", async ({
  page,
}) => {
  await serveSharedTrip(page, false);
  // Registered later, so it wins: the list of shared folders cannot be read.
  let failing = true;
  await page.route(
    `**/users/${MARY_ID}/documents/${TestData.mary.settings!.chats}`,
    (route) => (failing ? route.fulfill({ status: 500 }) : route.fallback()),
  );
  await loginAt(page, `/documents/${TRIP}`);

  await expect(page.getByText("Could not load your folders.")).toBeVisible();
  await expect(
    page.getByText("This folder cannot be opened directly."),
  ).toHaveCount(0);

  // Trying again finds the shared folder.
  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
});
