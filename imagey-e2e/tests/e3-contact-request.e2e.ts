import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { inviteContact, openChats, registerUser } from "./support/users";

// E3: contact request between two registered users. bob declines the first one, after which alice
// cannot send another (409). bob then invites alice, who accepts.
test("E3: bob declines alice's request, then invites her and she accepts", async ({
  browser,
}) => {
  const alice = await registerUser(browser, "alice");
  const bob = await registerUser(browser, "bob");
  await inviteContact(alice.page, bob.email, "Alice");

  await openChats(bob.page);
  await expect(bob.page.getByText(alice.email)).toBeVisible();
  await bob.page.getByRole("button", { name: "close" }).click();
  await expect(bob.page.getByText(alice.email)).toHaveCount(0);

  // The declined request blocks alice: the server refuses another one (409, which the UI does
  // not report yet) and nothing reaches bob.
  await openChats(alice.page);
  await alice.page
    .getByRole("button", { name: "Invite Contact" })
    .or(alice.page.getByRole("button", { name: "add", exact: true }))
    .first()
    .click();
  await alice.page.getByPlaceholder("email@imagey.cloud").fill(bob.email);
  await alice.page.getByRole("button", { name: "Confirm" }).click();
  await expect(
    alice.page.getByRole("heading", { name: "Add Contact" }),
  ).toHaveCount(0);
  await openChats(bob.page);
  await expect(bob.page.getByText(alice.email)).toHaveCount(0);

  // bob takes the first step, alice accepts.
  await inviteContact(bob.page, alice.email, "Bob");
  await openChats(alice.page);
  await expect(alice.page.getByText(bob.email)).toBeVisible();
  await acceptRequest(alice.page);

  // The contact shows up once bob's chat list has processed the accepted request.
  await expect(async () => {
    await openChats(bob.page);
    await expect(bob.page.getByText("Alice", { exact: true })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass();
  await expect(bob.page.getByRole("button", { name: "check" })).toHaveCount(0);
  await openChats(alice.page);
  await expect(alice.page.getByText("Bob", { exact: true })).toBeVisible();
});

async function acceptRequest(page: Page): Promise<void> {
  // alice named herself when she sent her first request, so there is no name prompt.
  await page.getByRole("button", { name: "check" }).click();
  await expect(page.getByRole("button", { name: "check" })).toHaveCount(0);
}
