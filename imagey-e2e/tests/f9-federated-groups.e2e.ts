import { type Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { federatedPair } from "./support/federation";
import {
  expectImageLoaded,
  inviteNewUser,
  openChat,
  openChats,
  uploadImage,
} from "./support/users";

// F9 (docs/plans/f9-federated-groups.md): groups with members on another server. Alice and carol
// have their accounts on A, bob his on B; bob's chat with alice lives on A. Everything goes
// through the UI of real clients.

// The conversation view is rebuilt while the group and its messages are still loading, which
// drops what was typed; so the message is sent again until it shows.
async function sendWhenSettled(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await page.getByLabel("Type a message").fill(text);
    await page.getByRole("button", { name: "send" }).click();
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

const IMAGE = "beach-4524911_480.jpg";

test("F9: alice's group on A has bob from B as a member, who reads and writes there but cannot share", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { alice, bob } = await federatedPair(browser);
  const carol = await inviteNewUser(browser, alice, "Carol");
  const errors: string[] = [];
  for (const user of [alice, bob, carol]) {
    user.page.on("pageerror", (error) => errors.push(error.message));
  }

  // 1. alice creates the group; bob is selectable although his account is on B.
  // carol's acceptance is picked up when the chat list is loaded after it
  await expect(async () => {
    await openChats(alice.page);
    await expect(alice.page.getByText("Carol", { exact: true })).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 30_000 });
  await alice.page
    .getByRole("button", { name: "group_add", exact: true })
    .click();
  await alice.page.getByPlaceholder("Group Name").fill("Team");
  await alice.page.getByRole("checkbox", { name: "Bob", exact: true }).check();
  await alice.page
    .getByRole("checkbox", { name: "Carol", exact: true })
    .check();
  await alice.page.getByRole("button", { name: "Create" }).click();
  await expect(alice.page.getByText("Team", { exact: true })).toBeVisible();

  // 2. both join from their chat with alice: carol locally, bob as a guest of A.
  for (const member of [bob, carol]) {
    await openChats(member.page);
    await openChat(member.page, "Alice");
    await expect(member.page.getByText("Group invitation: Team")).toBeVisible();
    await member.page.getByRole("button", { name: "Join" }).click();
    await expect(
      member.page.getByRole("link", { name: "Open", exact: true }),
    ).toBeVisible();
  }

  // 3. all three write, all three read everything; bob's own message is on his side.
  await openChats(bob.page);
  await openChat(bob.page, "Team");
  await sendWhenSettled(bob.page, "Hello from B");
  await openChats(carol.page);
  await openChat(carol.page, "Team");
  await expect(carol.page.getByText("Hello from B")).toBeVisible();
  await sendWhenSettled(carol.page, "Hi Bob");
  await expect(bob.page.getByText("Hi Bob")).toBeVisible();
  await openChats(alice.page);
  await openChat(alice.page, "Team");
  await expect(alice.page.getByText("Hello from B")).toBeVisible();
  await expect(alice.page.getByText("Hi Bob")).toBeVisible();
  await expect(
    bob.page.locator("div.elevate", { hasText: "Hello from B" }),
  ).toHaveCSS("align-self", "flex-end");

  // 4. everybody sees bob with his name (from the snapshot in the group), and bob sees carol's image.
  const bobsMessage = carol.page.locator("div.elevate", {
    hasText: "Hello from B",
  });
  await expect(bobsMessage).toContainText("Bob");
  await uploadImage(carol.page, IMAGE);
  await openChats(carol.page);
  await openChat(carol.page, "Team");
  await carol.page.getByRole("button", { name: "attach_file" }).click();
  await carol.page.locator("dialog").getByAltText(IMAGE).click();
  await expectImageLoaded(carol.page.locator(".shared-document img"));
  await expectImageLoaded(bob.page.locator(".shared-document img"));
  await expect(
    bob.page
      .locator("div.elevate")
      .filter({ has: bob.page.locator(".shared-document img") }),
  ).toContainText("Carol");

  // 5. bob cannot share into a group on another server.
  await expect(
    bob.page.getByRole("button", { name: "attach_file" }),
  ).toBeDisabled();

  expect(errors).toEqual([]);
});

test("F9: bob's group on B has alice from A as a member", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { alice, bob } = await federatedPair(browser);

  // bob's chat with alice lives on A, the group on B.
  await openChats(bob.page);
  await bob.page
    .getByRole("button", { name: "group_add", exact: true })
    .click();
  await bob.page.getByPlaceholder("Group Name").fill("Projekt");
  await bob.page.getByRole("checkbox", { name: "Alice", exact: true }).check();
  await bob.page.getByRole("button", { name: "Create" }).click();
  await expect(bob.page.getByText("Projekt", { exact: true })).toBeVisible();

  await openChats(alice.page);
  await openChat(alice.page, "Bob");
  await expect(alice.page.getByText("Group invitation: Projekt")).toBeVisible();
  await alice.page.getByRole("button", { name: "Join" }).click();
  await alice.page.getByRole("link", { name: "Open", exact: true }).click();

  await sendWhenSettled(alice.page, "Hello from A");
  await openChats(bob.page);
  await openChat(bob.page, "Projekt");
  await expect(bob.page.getByText("Hello from A")).toBeVisible();
  await sendWhenSettled(bob.page, "Welcome");
  await expect(alice.page.getByText("Welcome")).toBeVisible();
});
