import { randomUUID } from "node:crypto";
import { test, expect } from "./support/fixtures";
import { newDevice, serverURL } from "./support/users";

// F3 (docs/plans/f11-f3-second-server-guest-auth.md): CORS across a real origin boundary. A page of
// server B calls server A like a guest would (bearer token, no credentials). No guest token is
// issued yet (F4), so an invalid one is used: what counts is that the browser lets the answer pass.
test("F3: a foreign origin reaches the guest routes without credentials, and nothing else", async ({
  browser,
}) => {
  const { page } = await newDevice(browser, "b");
  await page.goto("/");
  const a = serverURL("a");
  const user = randomUUID();
  const guestRoute = `${a}/users/${user}/documents/${randomUUID()}/messages`;
  const ownerRoute = `${a}/users/${user}/devices`;

  // Preflight and CORS headers pass, so the page can read the 401 (it would renew its token).
  const guest = await page.evaluate(
    (url) =>
      fetch(url, {
        headers: { Authorization: "Bearer invalid" },
        credentials: "omit",
      }).then((response) => response.status),
    guestRoute,
  );
  expect(guest).toBe(401);

  // No wildcard CORS outside of the guest routes.
  const owner = await page.evaluate(
    (url) =>
      fetch(url, {
        headers: { Authorization: "Bearer invalid" },
        credentials: "omit",
      }).then(
        () => "answered",
        () => "blocked",
      ),
    ownerRoute,
  );
  expect(owner).toBe("blocked");

  // A wildcard does not apply to requests with credentials.
  const withCredentials = await page.evaluate(
    (url) =>
      fetch(url, {
        headers: { Authorization: "Bearer invalid" },
        credentials: "include",
      }).then(
        () => "answered",
        () => "blocked",
      ),
    guestRoute,
  );
  expect(withCredentials).toBe("blocked");
});
