import { test, expect } from "./support/fixtures";
import { newDevice, serverURL } from "./support/users";

// F1 (docs/plans/f1-f2-federation-keys.md): a page of server A reads the signing key of server B,
// as the client will do before it trusts a server name the user typed (F7): across the origin
// boundary, without credentials. That the browser lets the answer through is the CORS check.
test("F1: the signing key of a server is readable from the page of another one", async ({
  browser,
}) => {
  const { page } = await newDevice(browser, "a");
  await page.goto("/");

  const read = (server: "a" | "b") =>
    page.evaluate(async (url) => {
      const response = await fetch(`${url}/users/federation/key`, {
        credentials: "omit",
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    }, serverURL(server));

  const b = await read("b");
  expect(b.status).toBe(200);
  expect(b.body.keys).toHaveLength(1);
  expect(b.body.keys[0]).toMatchObject({
    kty: "EC",
    crv: "P-256",
    alg: "ES256",
  });
  expect(b.body.keys[0].d).toBeUndefined();

  // Each server has an identity of its own.
  const a = await read("a");
  expect(a.body.keys[0].kid).not.toBe(b.body.keys[0].kid);
});
