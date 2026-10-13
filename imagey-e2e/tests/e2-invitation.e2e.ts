import { test, expect } from "./support/fixtures";
import { mailCount, waitForMailLink } from "./support/mailbox";
import {
  baseURL,
  connectedPair,
  inviteContact,
  newDevice,
  randomEmail,
  registerUser,
} from "./support/users";

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

// Opening the link (a mail client's link scanner does that) must not register anybody: the
// account is created by the invitee's click on "create an account here" (ADR 0013 A11).
test("E2: opening the invitation link registers nobody", async ({
  browser,
}) => {
  const alice = await registerUser(browser, "alice");
  const email = randomEmail("carol");
  const scanner = await newDevice(browser);
  await inviteContact(alice.page, email, "Alice");
  const link = await waitForMailLink(email, /^\/invitations\//, baseURL());

  await scanner.page.goto(link);
  await expect(
    scanner.page.getByRole("button", { name: "Create an account here" }),
  ).toBeVisible();
  await expect(scanner.page).toHaveURL(/\/join#token=/);
  const cookies = await scanner.context.cookies();
  expect(cookies).toHaveLength(0);

  // Still not registered: a second inviter's invitation to the same address mails a link again.
  const bob = await registerUser(browser, "bob");
  const mails = await mailCount(email);
  await inviteContact(bob.page, email, "Bob");
  await waitForMailLink(email, /^\/invitations\//, baseURL(), {
    after: mails,
  });
});
