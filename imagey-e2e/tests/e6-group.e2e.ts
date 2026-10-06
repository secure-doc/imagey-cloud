import { test, expect } from "./support/fixtures";
import {
  expectImageLoaded,
  inviteNewUser,
  openChat,
  openChats,
  registerUser,
  sendMessage,
  uploadImage,
} from "./support/users";

// E6: alice creates a group and invites bob and carol through their 1:1 chats. Both join; carol
// shares an image and bob sees it with carol's name.
test("E6: alice creates a group, carol shares an image, bob sees it with carol's name", async ({
  browser,
}) => {
  const image = "beach-4524911_480.jpg";
  const alice = await registerUser(browser, "alice");
  const bob = await inviteNewUser(browser, alice, "Bob", "Alice");
  const carol = await inviteNewUser(browser, alice, "Carol");
  await alice.page
    .getByRole("button", { name: "group_add", exact: true })
    .click();
  await expect(
    alice.page.getByRole("heading", { name: "Create Group" }),
  ).toBeVisible();
  await alice.page.getByPlaceholder("Group Name").fill("Team");
  await alice.page.getByRole("checkbox", { name: "Bob", exact: true }).check();
  await alice.page
    .getByRole("checkbox", { name: "Carol", exact: true })
    .check();
  await alice.page.getByRole("button", { name: "Create" }).click();
  await expect(alice.page.getByText("Team", { exact: true })).toBeVisible();

  for (const member of [bob, carol]) {
    await openChats(member.page);
    await openChat(member.page, "Alice");
    await expect(member.page.getByText("Group invitation: Team")).toBeVisible();
    await member.page.getByRole("button", { name: "Join" }).click();
    await expect(
      member.page.getByRole("link", { name: "Open", exact: true }),
    ).toBeVisible();
  }

  await uploadImage(carol.page, image);
  await openChats(carol.page);
  await openChat(carol.page, "Team");
  await carol.page.getByRole("button", { name: "attach_file" }).click();
  await carol.page.locator("dialog").getByAltText(image).click();
  await expectImageLoaded(carol.page.locator(".shared-document img"));
  await sendMessage(carol.page, "Look at this");

  await openChats(bob.page);
  await openChat(bob.page, "Team");
  await expect(bob.page.getByText("Look at this")).toBeVisible();
  await expectImageLoaded(bob.page.locator(".shared-document img"));
  // Carol's name belongs to the very message that carries the image.
  const carolsImage = bob.page
    .locator("div.elevate")
    .filter({ has: bob.page.locator(".shared-document img") });
  await expect(carolsImage).toContainText("Carol");
});
