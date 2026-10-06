import { readFile } from "node:fs/promises";
import { test, expect } from "./support/fixtures";
import {
  connectedPair,
  expectImageLoaded,
  imagePath,
  openChat,
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
