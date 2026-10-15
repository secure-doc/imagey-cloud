import { readFile } from "node:fs/promises";
import { test, expect } from "./support/fixtures";
import {
  assetPath,
  login,
  connectedPair,
  expectImageLoaded,
  imagePath,
  openChat,
  uploadFileHere,
  uploadImage,
} from "./support/users";

// E5: alice shares an image in the chat (the share dialog lists the top-level documents only); bob opens it and downloads the
// original, which has to be byte-identical to what alice uploaded.
test("E5: bob downloads the original of an image alice shared", async ({
  browser,
}) => {
  const image = "beach-4524911_480.jpg";
  const { alice, bob } = await connectedPair(browser);
  await uploadImage(alice.page, image);

  await alice.page.getByRole("link", { name: "Chats" }).first().click();
  await openChat(alice.page, bob.name);
  await alice.page.getByRole("button", { name: "attach_file" }).click();
  await expect(alice.page.getByText("Share Document")).toBeVisible();
  await alice.page.locator("dialog").getByAltText(image).click();
  await expect(alice.page.locator(".shared-document img")).toBeVisible();

  await openChat(bob.page, alice.name);
  await expectImageLoaded(bob.page.locator(".shared-document img"));
  await bob.page.locator(".shared-document img").click();
  await expectImageLoaded(bob.page.getByAltText(image));

  // The detail page can be opened directly (deep link, reload): the chat key is resolved from the
  // chats document first. Bob stays logged in, so the app opens straight into it.
  const detailUrl = bob.page.url();
  await login(bob.page, bob.email, { keepLoggedIn: true });
  await bob.page.goto(detailUrl);
  await expectImageLoaded(bob.page.getByAltText(image));
  await expect(bob.page.getByText("No image found")).toBeHidden();

  const [download] = await Promise.all([
    bob.page.waitForEvent("download"),
    bob.page.getByLabel("download").click(),
  ]);
  expect(download.suggestedFilename()).toBe(image);
  const path = await download.path();
  expect(
    Buffer.compare(await readFile(path), await readFile(imagePath(image))),
  ).toBe(0);
});

// A file that is not an image is shared as a tile of the chat; a click downloads it.
test("E5: bob downloads a file alice shared in the chat", async ({
  browser,
}) => {
  const file = "shared.txt";
  const { alice, bob } = await connectedPair(browser);

  await alice.page.getByRole("link", { name: "Images" }).click();
  await uploadFileHere(alice.page, file);

  await alice.page.getByRole("link", { name: "Chats" }).first().click();
  await openChat(alice.page, bob.name);
  await alice.page.getByRole("button", { name: "attach_file" }).click();
  await expect(alice.page.getByText("Share Document")).toBeVisible();
  // The tile of a file in the dialog is a plain one (no preview), so it is not looked up by name.
  await alice.page.locator("dialog a").click();

  await openChat(bob.page, alice.name);
  const [download] = await Promise.all([
    bob.page.waitForEvent("download"),
    bob.page.getByLabel(file).click(),
  ]);
  expect(download.suggestedFilename()).toBe(file);
  expect(await readFile(await download.path(), "utf8")).toBe(
    await readFile(assetPath(file), "utf8"),
  );
});
