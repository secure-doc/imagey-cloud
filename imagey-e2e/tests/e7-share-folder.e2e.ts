import { readFile } from "node:fs/promises";
import { test, expect } from "./support/fixtures";
import {
  connectedPair,
  createFolder,
  expectImageLoaded,
  imagePath,
  inviteNewUser,
  login,
  openChat,
  openChats,
  registerUser,
  uploadImageHere,
} from "./support/users";

// E7: alice shares a folder (read-only) with bob. Bob takes it over from the chat, finds it under
// "Shared with me" (also after a reload), browses into its sub-folder and downloads an image
// there - byte-identical to what alice uploaded - but cannot add anything.
test("E7: bob reads a folder alice shared with him", async ({ browser }) => {
  const topImage = "beach-4524911_480.jpg";
  const nestedImage = "beach-1836467_1920.jpg";
  const { alice, bob } = await connectedPair(browser);

  await alice.page.getByRole("link", { name: "Images" }).click();
  await createFolder(alice.page, "Urlaub");
  await alice.page.getByAltText("Urlaub").click({ force: true });
  await uploadImageHere(alice.page, topImage);
  await createFolder(alice.page, "Tag 1");
  await alice.page.getByAltText("Tag 1").click({ force: true });
  await uploadImageHere(alice.page, nestedImage);
  await alice.page.getByRole("button", { name: "back-button" }).click();

  // Share "Urlaub" read-only with bob.
  // Until the folder is loaded the button has no menu.
  await expect(alice.page.locator("text='Upload Document'")).toBeAttached();
  await alice.page.locator("*[aria-label='add-menu']").click();
  await alice.page.getByText("Share folder", { exact: true }).click();
  await alice.page.getByLabel("Contact").selectOption({ label: bob.name });
  await alice.page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(alice.page.getByRole("dialog")).toHaveCount(0);

  // Bob opens the message in the chat: the folder shows up with its content.
  await bob.page.getByRole("link", { name: "Home" }).click();
  await bob.page.getByRole("link", { name: "Chats" }).first().click();
  await openChat(bob.page, alice.name);
  await expect(bob.page.getByText("Shared folder: Urlaub")).toBeVisible();
  await bob.page.getByRole("button", { name: "Open" }).click();
  await expectImageLoaded(bob.page.getByAltText(topImage));
  // Read-only: nothing to add.
  await expect(bob.page.locator("*[aria-label='add-menu']")).toHaveCount(0);

  // The sub-folder and the image in it.
  await bob.page.getByAltText("Tag 1").click({ force: true });
  await expectImageLoaded(bob.page.getByAltText(nestedImage));
  await bob.page.getByAltText(nestedImage).click();
  await expectImageLoaded(bob.page.getByAltText(nestedImage));
  const [download] = await Promise.all([
    bob.page.waitForEvent("download"),
    bob.page.getByLabel("download").click(),
  ]);
  expect(download.suggestedFilename()).toBe(nestedImage);
  expect(
    Buffer.compare(
      await readFile(await download.path()),
      await readFile(imagePath(nestedImage)),
    ),
  ).toBe(0);

  // After a reload the folder is still listed under "Shared with me".
  await login(bob.page, bob.email, { keepLoggedIn: true });
  await bob.page.goto("/documents");
  await bob.page.getByRole("button", { name: "shared-with-me" }).click();
  await bob.page.getByAltText("Urlaub").click();
  await expectImageLoaded(bob.page.getByAltText(topImage));
});

// E7b: alice shares a folder with contributions; bob adds an image in a sub-folder, alice sees it
// in her own folder, and carol - who knows alice, not bob - sees bob's image too, in a folder
// alice shares read-only with her.
test("E7: bob contributes to a folder alice shared, alice and carol see it", async ({
  browser,
}) => {
  const image = "beach-1836467_1920.jpg";
  const alice = await registerUser(browser, "alice");
  const bob = await inviteNewUser(browser, alice, "Bob", "Alice");
  const carol = await inviteNewUser(browser, alice, "Carol");

  await alice.page.getByRole("link", { name: "Images" }).click();
  await createFolder(alice.page, "Urlaub");
  await alice.page.getByAltText("Urlaub").click({ force: true });
  await createFolder(alice.page, "Tag 1");

  const share = async (contact: string, contributions: boolean) => {
    await expect(alice.page.locator("text='Upload Document'")).toBeAttached();
    await alice.page.locator("*[aria-label='add-menu']").click();
    await alice.page.getByText("Share folder", { exact: true }).click();
    await alice.page.getByLabel("Contact").selectOption({ label: contact });
    if (contributions) {
      await alice.page.getByLabel("May add content").check({ force: true });
    }
    await alice.page
      .getByRole("button", { name: "Share", exact: true })
      .click();
    await expect(alice.page.getByRole("dialog")).toHaveCount(0);
  };
  await share("Bob", true);

  await openChats(bob.page);
  await openChat(bob.page, "Alice");
  await bob.page.getByRole("button", { name: "Open" }).click();
  await bob.page.getByAltText("Tag 1").click({ force: true });
  await uploadImageHere(bob.page, image);

  // Alice reads what bob contributed to her folder.
  await alice.page.getByAltText("Tag 1").click({ force: true });
  await expectImageLoaded(alice.page.getByAltText(image));
  await alice.page.getByRole("button", { name: "back-button" }).click();

  // Carol reads it through alice's read-only share: bob's image, then Tag 1, then Urlaub.
  await share("Carol", false);
  await openChats(carol.page);
  await openChat(carol.page, "Alice");
  await carol.page.getByRole("button", { name: "Open" }).click();
  await carol.page.getByAltText("Tag 1").click({ force: true });
  await expectImageLoaded(carol.page.getByAltText(image));
  // Her share is read-only, whatever bob may do in the same folder.
  await expect(carol.page.locator("*[aria-label='add-menu']")).toHaveCount(0);
});
