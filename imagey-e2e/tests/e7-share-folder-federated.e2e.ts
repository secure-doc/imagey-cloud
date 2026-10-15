import { readFile } from "node:fs/promises";
import { test, expect } from "./support/fixtures";
import { federatedPair } from "./support/federation";
import {
  createFolder,
  expectImageLoaded,
  imagePath,
  openChat,
  openChats,
  uploadImageHere,
} from "./support/users";

// E7 across servers (docs/plans/share-folders.md §6): alice has an account on A and shares a
// folder with bob, whose account is on B. Bob reads it as a guest on A - but cannot contribute.
test("E7: bob on another server reads a folder alice shared, but cannot contribute", async ({
  browser,
}) => {
  const topImage = "beach-4524911_480.jpg";
  const nestedImage = "beach-1836467_1920.jpg";
  const { alice, bob } = await federatedPair(browser);

  await alice.page.getByRole("link", { name: "Images" }).click();
  await createFolder(alice.page, "Urlaub");
  await alice.page.getByAltText("Urlaub").click({ force: true });
  await uploadImageHere(alice.page, topImage);
  await createFolder(alice.page, "Tag 1");
  await alice.page.getByAltText("Tag 1").click({ force: true });
  await uploadImageHere(alice.page, nestedImage);
  await alice.page.getByRole("button", { name: "back-button" }).click();

  await expect(alice.page.locator("text='Upload Document'")).toBeAttached();
  await alice.page.locator("*[aria-label='add-menu']").click();
  await alice.page.getByText("Share folder", { exact: true }).click();
  await alice.page.getByLabel("Contact").selectOption({ label: bob.name });
  // A guest cannot contribute: the switch is off for him.
  await expect(alice.page.getByLabel("May add content")).toBeDisabled();
  await alice.page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(alice.page.getByRole("dialog")).toHaveCount(0);

  await openChats(bob.page);
  await openChat(bob.page, alice.name);
  await bob.page.getByRole("button", { name: "Open" }).click();
  await expectImageLoaded(bob.page.getByAltText(topImage));
  await expect(bob.page.locator("*[aria-label='add-menu']")).toHaveCount(0);

  await bob.page.getByAltText("Tag 1").click({ force: true });
  await expectImageLoaded(bob.page.getByAltText(nestedImage));
  await bob.page.getByAltText(nestedImage).click();
  await expectImageLoaded(bob.page.getByAltText(nestedImage));
  const [download] = await Promise.all([
    bob.page.waitForEvent("download"),
    bob.page.getByLabel("download").click(),
  ]);
  expect(
    Buffer.compare(
      await readFile(await download.path()),
      await readFile(imagePath(nestedImage)),
    ),
  ).toBe(0);
});

// The other way round: bob's folder stays on B, alice reads it there as a guest.
test("E7: alice reads a folder bob shared from his own server", async ({
  browser,
}) => {
  const image = "beach-4524911_480.jpg";
  const { alice, bob } = await federatedPair(browser);

  await bob.page.getByRole("link", { name: "Images" }).click();
  await createFolder(bob.page, "Trip");
  await bob.page.getByAltText("Trip").click({ force: true });
  await uploadImageHere(bob.page, image);

  await expect(bob.page.locator("text='Upload Document'")).toBeAttached();
  await bob.page.locator("*[aria-label='add-menu']").click();
  await bob.page.getByText("Share folder", { exact: true }).click();
  await bob.page.getByLabel("Contact").selectOption({ label: alice.name });
  await expect(bob.page.getByLabel("May add content")).toBeDisabled();
  await bob.page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(bob.page.getByRole("dialog")).toHaveCount(0);

  await openChats(alice.page);
  await openChat(alice.page, bob.name);
  await alice.page.getByRole("button", { name: "Open" }).click();
  await expectImageLoaded(alice.page.getByAltText(image));
});
