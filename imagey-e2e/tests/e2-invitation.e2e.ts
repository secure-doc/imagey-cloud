import { test, expect } from "./support/fixtures";
import { connectedPair } from "./support/users";

// E2: a registered user invites someone who is not registered yet. The invitee registers through
// the mailed link and both see each other with display name and address (ADR 0016).
test("E2: alice invites bob, bob registers via the invitation link and both see each other", async ({
  browser,
}) => {
  const { alice, bob } = await connectedPair(browser);
  await expect(alice.page.getByText("Bob", { exact: true })).toBeVisible();
  await expect(alice.page.getByText(bob.email)).toBeVisible();
  await expect(bob.page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(bob.page.getByText(alice.email)).toBeVisible();
});
