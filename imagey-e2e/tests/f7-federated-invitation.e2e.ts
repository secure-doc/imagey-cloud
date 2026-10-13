import { type Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { mailCount, waitForMailLink } from "./support/mailbox";
import {
  baseURL,
  enterDisplayName,
  inviteContact,
  newDevice,
  openChats,
  registerHere,
  registerUser,
  serverURL,
  setPassword,
  type User,
} from "./support/users";

// F7 (docs/plans/f7-federated-invitation.md): alice has an account on A, the invitees have one
// on B. They accept A's invitation from B and both sides see each other in the chat list.

const A_HOST = new URL(baseURL()).host;
const B_HOST = new URL(serverURL("b")).host;

// Opens the mailed link of A in `page`, chooses "I already have an account on another server"
// and types B. Ends on B's page for the invitation (B's login is up to the caller).
async function openInvitationAtA(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await expect(page).toHaveURL(/\/join#token=/);
  await page.getByLabel("Server").fill(B_HOST);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(`${serverURL("b")}/federation/accept**`);
}

// Alice is new in every test, so her first invitation asks for her display name.
// B does not know the user after the registration (the app stores the account only on a later
// visit), so arriving from A it asks for the address and mails a login link; the invitation waits
// in storage until the login led back into the app.
async function logInAtB(page: Page, email: string): Promise<void> {
  const mails = await mailCount(email);
  await page.getByPlaceholder("email@imagey.cloud").fill(email);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const loginLink = await waitForMailLink(
    email,
    /^\/authentications\//,
    serverURL("b"),
    { after: mails },
  );
  await page.goto(loginLink);
  await setPassword(page, "unlock");
}

async function inviteFromA(alice: User, invitee: User): Promise<string> {
  await inviteContact(alice.page, invitee.email, "Alice");
  return waitForMailLink(invitee.email, /^\/invitations\//, baseURL());
}

test("F7: bob accepts alice's invitation with his account on B and both see each other", async ({
  browser,
}) => {
  const alice = await registerUser(browser, "alice", "a");
  const bob = await registerUser(browser, "bob", "b");
  const errors: string[] = [];
  bob.page.on("pageerror", (error) => errors.push(error.message));
  const link = await inviteFromA(alice, bob);

  await openInvitationAtA(bob.page, link);
  await logInAtB(bob.page, bob.email);
  await expect(
    bob.page.getByRole("heading", { name: `Invitation from ${A_HOST}` }),
  ).toBeVisible();
  // The address the invitation went to is preselected.
  await bob.page.getByRole("button", { name: "Show invitation" }).click();
  await expect(
    bob.page.getByText(`Alice on ${A_HOST} invites you.`),
  ).toBeVisible();
  await bob.page.getByRole("button", { name: "Accept" }).click();
  // Bob registered without an invitation, so he has no display name yet.
  await enterDisplayName(bob.page, "Bob");

  // Bob (on B) sees Alice, with the name and address from the invitation.
  await expect(bob.page).toHaveURL(/\/chats$/);
  await expect(bob.page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(bob.page.getByText(alice.email)).toBeVisible();

  // Alice picks the acceptance up (leg 3) and sees Bob with his name and address.
  await openChats(alice.page);
  await expect(alice.page.getByText("Bob", { exact: true })).toBeVisible();
  await expect(alice.page.getByText(bob.email)).toBeVisible();

  // The entry of a chat on another server survives a reload without errors.
  await openChats(bob.page);
  await expect(bob.page.getByText("Alice", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("F7: a user whose device B knows only has to unlock it", async ({
  browser,
}) => {
  const alice = await registerUser(browser, "alice", "a");
  const carol = await registerUser(browser, "carol", "b");
  const link = await inviteFromA(alice, carol);
  // A visit with the account in the address makes B remember the device.
  await carol.page.goto("/");
  await logInAtB(carol.page, carol.email);

  await openInvitationAtA(carol.page, link);
  await setPassword(carol.page, "unlock");

  // The unlock kept the page: no detour through "/".
  await expect(carol.page).toHaveURL(/\/federation\/accept$/);
  await expect(
    carol.page.getByRole("heading", { name: `Invitation from ${A_HOST}` }),
  ).toBeVisible();
  await carol.page.getByRole("button", { name: "Show invitation" }).click();
  await carol.page.getByRole("button", { name: "Accept" }).click();
  await enterDisplayName(carol.page, "Carol");
  await expect(carol.page).toHaveURL(/\/chats$/);
  await expect(carol.page.getByText("Alice", { exact: true })).toBeVisible();
});

test("F7: a wrong address does not redeem the invitation, which can still be accepted on A", async ({
  browser,
}) => {
  const alice = await registerUser(browser, "alice", "a");
  const dave = await registerUser(browser, "dave", "b");
  const link = await inviteFromA(alice, dave);

  await openInvitationAtA(dave.page, link);
  await logInAtB(dave.page, dave.email);
  await dave.page
    .getByRole("combobox", { name: "Address" })
    .selectOption({ label: "Other address" });
  await dave.page
    .getByRole("textbox", { name: "Address" })
    .fill("someone-else@e2e.test");
  await dave.page.getByRole("button", { name: "Show invitation" }).click();
  await expect(
    dave.page.getByText(
      "The invitation could not be confirmed. Is the address correct?",
    ),
  ).toBeVisible();

  // The invitation is untouched: the address can still register at A with it.
  const newcomer = await newDevice(browser, "a");
  await newcomer.page.goto(link);
  await registerHere(newcomer.page);
  await setPassword(newcomer.page, "register", { displayName: "Dave" });
});
