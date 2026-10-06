import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import {
  connectedPair,
  login,
  openChat,
  openChats,
  sendMessage,
} from "./support/users";

// E4: bob writes right after accepting, before alice's chat list has created the chat
// (ADR 0015 section 4). alice then answers; both read both messages with their time (ADR 0021),
// also after logging in again.
test("E4: bob writes first, alice answers, both see both messages", async ({
  browser,
}) => {
  // alice stays away from the chat list, which would create the chat of the accepted request.
  const { alice, bob } = await connectedPair(browser, "Alice", "Bob", {
    inviterOnChats: false,
  });
  await openChat(bob.page, alice.name);
  await sendMessage(bob.page, "Hi Alice, Bob here");

  await openChats(alice.page);
  await openChat(alice.page, bob.name);
  await expect(alice.page.getByText("Hi Alice, Bob here")).toBeVisible();
  await sendMessage(alice.page, "Hi Bob, nice to meet you");

  await expectConversation(alice.page);
  await expectConversation(bob.page);

  // A new login starts with an empty client state and reads everything from the server.
  for (const user of [alice, bob]) {
    await login(user.page, user.email);
    await openChats(user.page);
    await openChat(user.page, user === alice ? bob.name : alice.name);
    await expectConversation(user.page);
  }
});

async function expectConversation(page: Page): Promise<void> {
  await expect(page.getByText("Hi Alice, Bob here")).toBeVisible();
  await expect(page.getByText("Hi Bob, nice to meet you")).toBeVisible();
  await expect(page.getByText("Today", { exact: true })).toHaveCount(1);
  // Every message shows its time, e.g. "02:05 PM" (the chat list may show one as well).
  await expect
    .poll(() => page.getByText(/^\d{2}:\d{2}\s?[AP]M$/).count())
    .toBeGreaterThanOrEqual(2);
}
