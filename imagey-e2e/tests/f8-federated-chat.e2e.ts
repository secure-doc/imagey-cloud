import { readFile } from "node:fs/promises";
import { type Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { federatedPair } from "./support/federation";
import {
  expectImageLoaded,
  imagePath,
  login,
  openChat,
  openChats,
  sendMessage,
  setPassword,
  uploadImage,
} from "./support/users";

// F8 (docs/plans/f8-federated-chat.md): alice has an account on A and invited bob, whose account is
// on B. The chat lives on A; bob reads and writes it as a guest. Everything here goes through the
// UI of two real clients; the stack runs with guest tokens of 20 seconds (federation.guest-session.ttl),
// so renewing during the polling really happens.

const ALICE_IMAGE = "beach-4524911_480.jpg";
const BOB_IMAGE = "child-355176_1920.jpg";
const AVATAR = "vitalykobzun-frau-7385461.jpg";

// Changes the display name and the picture of the public profile: Settings > Profile.
async function changeProfile(
  page: Page,
  name: string,
  picture: string,
): Promise<void> {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Profile", level: 5 }),
  ).toBeVisible();
  await page.locator("button:has(i:text('edit'))").first().click();
  await page.getByLabel("Name").fill(name);
  await page.locator("i:text('check')").first().click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("label", { hasText: "Change Picture" }).click();
  await (await chooser).setFiles(imagePath(picture));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
}

// A fresh visit: the device only asks for its password, or - without a session on this server -
// for the address first (login mail).
async function reopen(
  page: Page,
  email: string,
  server: "a" | "b",
): Promise<void> {
  await page.goto("/");
  const address = page.getByPlaceholder("email@imagey.cloud");
  const password = page.getByLabel("Password", { exact: true });
  await address.or(password).waitFor();
  if (await address.isVisible()) {
    await login(page, email, { server });
  } else {
    await setPassword(page, "unlock");
  }
}

// Shares `image` (one of the user's top-level documents) into the open chat.
async function shareImage(page: Page, image: string): Promise<void> {
  await page.getByRole("button", { name: "attach_file" }).click();
  await expect(page.getByText("Share Document")).toBeVisible();
  await page.locator("dialog").getByAltText(image).click();
  await expect(page.locator(".shared-document img").last()).toBeVisible();
}

// Opens the last shared image of the chat and downloads the original; its bytes have to equal the
// file the other one uploaded.
async function expectDownload(page: Page, image: string): Promise<void> {
  const shared = page.locator(".shared-document img").last();
  await expectImageLoaded(shared);
  await shared.click();
  await expectImageLoaded(page.getByAltText(image));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("download").click(),
  ]);
  expect(download.suggestedFilename()).toBe(image);
  expect(
    Buffer.compare(
      await readFile(await download.path()),
      await readFile(imagePath(image)),
    ),
  ).toBe(0);
}

test("F8: bob and alice chat across the servers, share images and keep it after a reload", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // alice stays away from the chat list, which would create the chat of the accepted request.
  const { alice, bob } = await federatedPair(browser, { aliceOnChats: false });
  const errors: string[] = [];
  for (const user of [alice, bob]) {
    user.page.on("pageerror", (error) => errors.push(error.message));
  }

  // 1. bob writes before the chat exists: provisional membership across the server boundary.
  await openChat(bob.page, alice.name);
  await sendMessage(bob.page, "Hello Alice, Bob from B");

  // 2. alice picks the acceptance up, reads it and answers; bob sees the answer by polling.
  await openChats(alice.page);
  await openChat(alice.page, bob.name);
  await expect(alice.page.getByText("Hello Alice, Bob from B")).toBeVisible();
  await sendMessage(alice.page, "Hi Bob, welcome");
  await expect(bob.page.getByText("Hi Bob, welcome")).toBeVisible();

  // 3. names and pictures are read live from the other one's server.
  await changeProfile(bob.page, "Bobby from B", AVATAR);
  await changeProfile(alice.page, "Alice of A", AVATAR);
  await openChats(alice.page);
  await openChat(alice.page, "Bob");
  await expect(
    alice.page.getByRole("img", { name: "Bobby from B" }),
  ).toBeVisible();
  await openChats(bob.page);
  await openChat(bob.page, "Alice");
  await expect(bob.page.getByRole("img", { name: "Alice of A" })).toBeVisible();

  // 4. images: each stays on the server of the one who shared it.
  await uploadImage(alice.page, ALICE_IMAGE);
  await uploadImage(bob.page, BOB_IMAGE);
  await openChats(alice.page);
  await openChat(alice.page, "Bobby from B");
  await shareImage(alice.page, ALICE_IMAGE);
  await openChats(bob.page);
  await openChat(bob.page, "Alice of A");
  await expectDownload(bob.page, ALICE_IMAGE);

  await bob.page.goBack();
  await shareImage(bob.page, BOB_IMAGE);
  await openChats(alice.page);
  await openChat(alice.page, "Bobby from B");
  await expectDownload(alice.page, BOB_IMAGE);

  // 5. a reload loses all client state (addresses, guest sessions): everything is still there.
  for (const user of [alice, bob]) {
    await reopen(user.page, user.email, user === alice ? "a" : "b");
    await openChats(user.page);
    await openChat(user.page, user === alice ? "Bobby from B" : "Alice of A");
    await expect(user.page.getByText("Hello Alice, Bob from B")).toBeVisible();
    await expect(user.page.getByText("Hi Bob, welcome")).toBeVisible();
    await expectImageLoaded(user.page.locator(".shared-document img").first());
  }

  // 6. the guest tokens (20 s here) expire and are renewed while the chat is open.
  await bob.page.waitForTimeout(25_000);
  await sendMessage(bob.page, "Still here after the token expired");
  await expect(
    alice.page.getByText("Still here after the token expired"),
  ).toBeVisible();
  await sendMessage(alice.page, "Me too");
  await expect(bob.page.getByText("Me too")).toBeVisible();

  // 7. The bell cannot be checked here: push needs VAPID keys, which the stack does not have.
  // The struck-through bell of a chat on another server is covered by the contract tests
  // (imagey-web federated-chat.test.ts).

  expect(errors).toEqual([]);
});
