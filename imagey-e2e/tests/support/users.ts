import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { mailCount, waitForMailLink } from "./mailbox";

export const PASSWORD = "E2E-Password-123!";

export interface Device {
  context: BrowserContext;
  page: Page;
}

export interface User extends Device {
  email: string;
}

export function randomEmail(name: string): string {
  return `${name}-${randomUUID().slice(0, 8)}@e2e.test`;
}

export function imagePath(name: string): string {
  return path.join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "imagey-web",
    "tests",
    "images",
    name,
  );
}

export function baseURL(): string {
  return process.env.E2E_BASE_URL ?? "http://localhost:8080";
}

// Every device of a test; fixtures.ts closes them when the test is over.
const openContexts: BrowserContext[] = [];

export async function closeAllDevices(): Promise<void> {
  await Promise.all(openContexts.splice(0).map((context) => context.close()));
}

// A new browser context is a new device: own IndexedDB, localStorage and cookies.
export async function newDevice(browser: Browser): Promise<Device> {
  const context = await browser.newContext({ baseURL: baseURL() });
  openContexts.push(context);
  return { context, page: await context.newPage() };
}

// Registers a fresh user with a verification mail from Greenmail, entirely through the UI.
export async function registerUser(
  browser: Browser,
  name: string,
): Promise<User> {
  const email = randomEmail(name);
  const device = await newDevice(browser);
  const { page } = device;
  await page.goto("/");
  await page.getByPlaceholder("email@imagey.cloud").fill(email);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/verification link/)).toBeVisible();

  const link = await waitForMailLink(email, /^\/registrations\//, baseURL());
  await page.goto(link);
  await setPassword(page, "register");
  return { ...device, email };
}

// Logs `email` in on `page` through the login mail, as a user whose session is gone does.
export async function login(
  page: Page,
  email: string,
  { keepLoggedIn = false } = {},
): Promise<void> {
  const mails = await mailCount(email);
  await page.goto("/");
  await page.getByPlaceholder("email@imagey.cloud").fill(email);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const link = await waitForMailLink(email, /^\/authentications\//, baseURL(), {
    after: mails,
  });
  await page.goto(link);
  await setPassword(page, "unlock", { keepLoggedIn });
}

// The password dialogs of the app differ in their fields; the caller says which one it expects
// instead of the helper guessing from what happens to be visible.
export type PasswordDialogMode = "register" | "unlock" | "newDevice";

const DIALOG_FIELDS: Record<
  PasswordDialogMode,
  { confirmPassword: boolean; keepLoggedIn: boolean }
> = {
  register: { confirmPassword: true, keepLoggedIn: false },
  unlock: { confirmPassword: false, keepLoggedIn: true },
  newDevice: { confirmPassword: true, keepLoggedIn: false },
};

// Fills the password dialog and confirms it. "Keep me logged in" is on by default and is
// switched off unless asked for. `displayName` is for registering through an invitation, which
// asks for the name right in the dialog.
export async function enterPassword(
  page: Page,
  mode: PasswordDialogMode,
  { keepLoggedIn = false, displayName = "" } = {},
): Promise<void> {
  const fields = DIALOG_FIELDS[mode];
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toBeVisible();
  await password.fill(PASSWORD);
  const confirmPassword = page.getByLabel("Confirm Password");
  if (fields.confirmPassword) {
    await confirmPassword.fill(PASSWORD);
  } else {
    await expect(confirmPassword).toHaveCount(0);
  }
  if (displayName) {
    await page.getByLabel("How should others see you?").fill(displayName);
  }
  const keep = page.getByRole("checkbox", { name: "Keep me logged in" });
  if (fields.keepLoggedIn) {
    await (keepLoggedIn
      ? keep.check({ force: true })
      : keep.uncheck({ force: true }));
  } else {
    await expect(keep).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
}

// Enters the password and waits until the app is open.
export async function setPassword(
  page: Page,
  mode: "register" | "unlock",
  options: { keepLoggedIn?: boolean; displayName?: string } = {},
): Promise<void> {
  await enterPassword(page, mode, options);
  await expect(page.getByRole("link", { name: "Images" })).toBeVisible({
    timeout: 30_000,
  });
}

export async function uploadImage(
  page: Page,
  imageName: string,
): Promise<void> {
  await page.getByRole("link", { name: "Images" }).click();
  await uploadImageHere(page, imageName);
}

// Uploads into the folder that is currently open on the images page.
export async function uploadImageHere(
  page: Page,
  imageName: string,
): Promise<void> {
  const addMenuButton = page.locator("*[aria-label='add-menu']");
  await expect(addMenuButton).toBeVisible();
  // Until the folder is loaded the button has no menu.
  await expect(page.locator("text='Upload Document'")).toBeAttached();
  await addMenuButton.click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("text='Upload Document'").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(imagePath(imageName));
  await expect(page.getByAltText(imageName)).toBeVisible({ timeout: 30_000 });
}

// Sends a contact request / invitation to `email` from the chats page.
// A user without a public profile is asked for a display name first (`displayName`).
export async function inviteContact(
  page: Page,
  email: string,
  displayName?: string,
): Promise<void> {
  await page.getByRole("link", { name: "Chats" }).first().click();
  // "Invite Contact" on the empty chats page, the "add" icon once contacts exist.
  await page
    .getByRole("button", { name: "Invite Contact" })
    .or(page.getByRole("button", { name: "add", exact: true }))
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Add Contact" }),
  ).toBeVisible();
  await page.getByPlaceholder("email@imagey.cloud").fill(email);
  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/contact-requests"),
  );
  await page.getByRole("button", { name: "Confirm" }).click();
  if (displayName) {
    await enterDisplayName(page, displayName);
  }
  await posted;
  await expect(page.getByRole("heading", { name: "Add Contact" })).toHaveCount(
    0,
  );
}

export async function enterDisplayName(
  page: Page,
  name: string,
): Promise<void> {
  const prompt = page.getByRole("heading", {
    name: "How should others see you?",
  });
  await expect(prompt).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(prompt).toHaveCount(0);
}

export interface Person extends User {
  name: string;
}

// `inviter` invites a new user, who registers through the invitation link with `name`. Both end
// up as contacts of each other. `inviterName` is needed on the inviter's first invitation only.
export async function inviteNewUser(
  browser: Browser,
  inviter: User,
  name: string,
  inviterName?: string,
  { inviterOnChats = true } = {},
): Promise<Person> {
  const email = randomEmail(name.toLowerCase());
  const device = await newDevice(browser);
  await inviteContact(inviter.page, email, inviterName);
  const link = await waitForMailLink(email, /^\/invitations\//, baseURL());
  await device.page.goto(link);
  await setPassword(device.page, "register", { displayName: name });
  await openChats(device.page);
  if (inviterOnChats) {
    await openChats(inviter.page);
  } else {
    // The chat list creates the chat of an accepted request (ADR 0015), so the inviter has to
    // stay away from it for the invitee to be first.
    await inviter.page.getByRole("link", { name: "Home" }).click();
  }
  return { ...device, email, name };
}

// Alice (registered) invites a new user, who registers through the invitation link.
export async function connectedPair(
  browser: Browser,
  aliceName = "Alice",
  bobName = "Bob",
  options: { inviterOnChats?: boolean } = {},
): Promise<{ alice: Person; bob: Person }> {
  const alice = await registerUser(browser, aliceName.toLowerCase());
  const bob = await inviteNewUser(browser, alice, bobName, aliceName, options);
  return { alice: { ...alice, name: aliceName }, bob };
}

// Chat list; leaves and re-enters it, which reloads the contacts.
export async function openChats(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("link", { name: "Chats" }).first().click();
}

export async function openChat(page: Page, contactName: string): Promise<void> {
  await page.getByText(contactName, { exact: true }).first().click();
  await expect(page.getByLabel("Type a message")).toBeVisible();
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Type a message").fill(text);
  await page.getByRole("button", { name: "send" }).click();
  await expect(page.getByText(text)).toBeVisible();
}

export async function createFolder(page: Page, name: string): Promise<void> {
  const addMenuButton = page.locator("*[aria-label='add-menu']");
  await expect(page.locator("text='Upload Document'")).toBeAttached();
  await addMenuButton.click();
  await page.locator("text='Create Folder'").click();
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByAltText(name)).toBeVisible();
}

// A broken (e.g. undecryptable) image is "visible" as well, so check that it really decoded.
export async function expectImageLoaded(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
}

// Signs `email` in on a device without a registered device key and sets its password. The device
// then waits for its activation by another device.
export async function loginOnNewDevice(
  device: Device,
  email: string,
): Promise<void> {
  const { page } = device;
  const mails = await mailCount(email);
  await page.goto("/");
  await page.getByPlaceholder("email@imagey.cloud").fill(email);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const link = await waitForMailLink(email, /^\/authentications\//, baseURL(), {
    after: mails,
  });
  await page.goto(link);
  await enterPassword(page, "newDevice");
  await expect(
    page.getByText("you can now activate it with another device"),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();
}

// Activates the device that is waiting for it, on a device that is already active.
export async function activateDevice(active: Device): Promise<void> {
  const { page } = active;
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Devices" }).click();
  const waiting = page.locator("li", { hasText: "Waiting for activation" });
  await expect(waiting).toBeVisible();
  await waiting.getByText("Waiting for activation").click();
  await expect(
    page.getByText(/Do you want to activate the device/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(waiting).toHaveCount(0);
}
