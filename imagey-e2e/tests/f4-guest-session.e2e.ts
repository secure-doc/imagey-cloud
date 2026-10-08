import { type Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { waitForMailLink } from "./support/mailbox";
import {
  inviteContact,
  registerUser,
  serverURL,
  type User,
} from "./support/users";

// F5 + F4 (docs/plans/f4-f5-f6b-guest-session.md): Bob is logged in on server B and holds an
// invitation of Alice, who is on server A. He gets an assertion from B and redeems it at A. There is
// no UI for it yet (F7), so the pages of B speak the server protocol through fetch - which also
// proves that A fetches the signing key of B over the network (F2 + F11) and that CORS holds (F3).
const A = serverURL("a");
const B = serverURL("b");
const HOST_A = new URL(A).host;

interface Redeemed {
  status: number;
  body: { token?: string; userId?: string; expiresIn?: number };
}

// An assertion of the own server (B), the user being logged in on `page`.
async function mint(
  page: Page,
  userId: string,
  aud: string,
  email: string,
): Promise<{ status: number; assertion?: string }> {
  return page.evaluate(
    async ({ userId, aud, email }) => {
      const response = await fetch(`/users/${userId}/federation-assertions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aud, email }),
      });
      return {
        status: response.status,
        assertion: response.ok ? (await response.json()).assertion : undefined,
      };
    },
    { userId, aud, email },
  );
}

// What the browser of a B user does at A: no credentials, the assertion is the credential.
async function redeem(
  page: Page,
  assertion: string,
  invitationToken?: string,
): Promise<Redeemed> {
  return page.evaluate(
    async ({ origin, assertion, invitationToken }) => {
      const response = await fetch(`${origin}/users/federation/sessions`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion, invitationToken }),
      });
      return { status: response.status, body: await response.json() };
    },
    { origin: A, assertion, invitationToken },
  );
}

async function assertionFor(
  user: User,
  userId: string,
  aud = HOST_A,
  email = user.email,
): Promise<string> {
  const minted = await mint(user.page, userId, aud, email);
  expect(minted.status).toBe(200);
  return minted.assertion!;
}

async function contactRequestsAtA(
  page: Page,
  guestId: string,
  token: string,
): Promise<{ inviter: string; invitee: string; status: string }[]> {
  return page.evaluate(
    async ({ origin, guestId, token }) => {
      const response = await fetch(
        `${origin}/users/${guestId}/contact-requests`,
        {
          credentials: "omit",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      return response.json();
    },
    { origin: A, guestId, token },
  );
}

test("F4/F5: a user of server B redeems an invitation of server A with an assertion of B", async ({
  browser,
}) => {
  const alice = await registerUser(browser, "alice", "a");
  const bob = await registerUser(browser, "bob", "b");
  const carol = await registerUser(browser, "carol", "b");
  const bobId = bob.userId;
  const carolId = carol.userId;

  // A does not know Bob's address, so it mails an invitation to it.
  await inviteContact(alice.page, bob.email, "Alice");
  const link = await waitForMailLink(bob.email, /^\/invitations\//, A);
  const invitationToken = new URL(link).pathname.split("/").pop()!;

  // First contact: assertion of B + invitation token -> guest session at A.
  const first = await redeem(
    bob.page,
    await assertionFor(bob, bobId),
    invitationToken,
  );
  expect(first.status).toBe(200);
  expect(first.body.expiresIn).toBe(900);
  const bobAtA = first.body.userId!;
  // The id at A is not the id at B: nobody can claim an id of another server.
  expect(bobAtA).not.toBe(bobId);
  const invitations = await contactRequestsAtA(
    bob.page,
    bobAtA,
    first.body.token!,
  );
  expect(invitations).toHaveLength(1);
  expect(invitations[0]).toMatchObject({ invitee: bobAtA, status: "INVITED" });

  // Renewing needs no invitation and keeps the id; the invitation is not moved twice.
  const renewalAssertion = await assertionFor(bob, bobId);
  const renewed = await redeem(bob.page, renewalAssertion);
  expect(renewed.status).toBe(200);
  expect(renewed.body.userId).toBe(bobAtA);
  expect(
    await contactRequestsAtA(bob.page, bobAtA, renewed.body.token!),
  ).toHaveLength(1);

  // An assertion works once.
  const replay = await redeem(bob.page, renewalAssertion);
  expect(replay.status).toBe(401);
  expect(replay.body).toEqual({});

  // An assertion for another server is of no use at A (B signs it, A is not the audience).
  const elsewhere = await redeem(
    bob.page,
    await assertionFor(bob, bobId, "other.localhost:1"),
  );
  expect(elsewhere.status).toBe(401);

  // Carol is vouched for by B as well, but the invitation is Bob's: the same answer as for any
  // other failure, so that nobody learns what was invited.
  const stolen = await redeem(
    carol.page,
    await assertionFor(carol, carolId),
    invitationToken,
  );
  expect(stolen.status).toBe(401);
  expect(stolen.body).toEqual({});
  const stranger = await redeem(carol.page, await assertionFor(carol, carolId));
  expect(stranger.status).toBe(401);
  expect(stranger.body).toEqual({});

  // B itself only vouches for the logged-in user's own address, and not for its own domain.
  expect((await mint(bob.page, bobId, HOST_A, carol.email)).status).toBe(403);
  expect((await mint(bob.page, bobId, new URL(B).host, bob.email)).status).toBe(
    403,
  );
});
