import { expect, type Browser, type Page } from "@playwright/test";
import { mailCount, waitForMailLink } from "./mailbox";
import {
  baseURL,
  enterDisplayName,
  inviteContact,
  openChats,
  registerUser,
  serverURL,
  setPassword,
  type User,
} from "./users";

export const A_HOST = new URL(baseURL()).host;
export const B_HOST = new URL(serverURL("b")).host;

// Opens the mailed link of A in `page`, chooses "I already have an account on another server"
// and types B. Ends on B's page for the invitation (B's login is up to the caller).
export async function openInvitationAtA(
  page: Page,
  link: string,
): Promise<void> {
  await page.goto(link);
  await expect(page).toHaveURL(/\/join#token=/);
  await page.getByLabel("Server").fill(B_HOST);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(`${serverURL("b")}/federation/accept**`);
}

// B does not know the user after the registration (the app stores the account only on a later
// visit), so arriving from A it asks for the address and mails a login link; the invitation waits
// in storage until the login led back into the app.
export async function logInAtB(page: Page, email: string): Promise<void> {
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

// Alice is new in every test, so her first invitation asks for her display name.
export async function inviteFromA(alice: User, invitee: User): Promise<string> {
  await inviteContact(alice.page, invitee.email, "Alice");
  return waitForMailLink(invitee.email, /^\/invitations\//, baseURL());
}

// Alice (an account on A) invites Bob (an account on B), who accepts from B. With
// `aliceOnChats: false` alice stays away from her chat list, which would create the chat of the
// accepted request (ADR 0015) - bob can then write first.
export async function federatedPair(
  browser: Browser,
  { aliceOnChats = true } = {},
): Promise<{ alice: User & { name: string }; bob: User & { name: string } }> {
  const alice = await registerUser(browser, "alice", "a");
  const bob = await registerUser(browser, "bob", "b");
  const link = await inviteFromA(alice, bob);

  await openInvitationAtA(bob.page, link);
  await logInAtB(bob.page, bob.email);
  await bob.page.getByRole("button", { name: "Show invitation" }).click();
  await bob.page.getByRole("button", { name: "Accept" }).click();
  await enterDisplayName(bob.page, "Bob");
  await expect(bob.page).toHaveURL(/\/chats$/);

  if (aliceOnChats) {
    await openChats(alice.page);
  } else {
    await alice.page.getByRole("link", { name: "Home" }).click();
  }
  return {
    alice: { ...alice, name: "Alice" },
    bob: { ...bob, name: "Bob" },
  };
}
