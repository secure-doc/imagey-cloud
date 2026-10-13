import { Page } from "@playwright/test";
import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import { clearLocalStorage, provider, setupMockServer } from "./setup";

const INVITER = "d20cf443-4f96-418f-a957-c8cbef8677c3";
const REMOTE = "https://remote.test";
const KEY_SET = {
  keys: [
    {
      kty: "EC",
      crv: "P-256",
      kid: "kid-1",
      x: "O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4",
      y: "ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU",
    },
  ],
};
const CORS = { "Access-Control-Allow-Origin": "*" };

// A token as InvitationFilter hands it out: a JWT whose subject is the invited address.
function invitationToken(subject = "bob@b.test"): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256" })}.${encode({ sub: subject })}.c2ln`;
}

const joinUrl = (token = invitationToken()) =>
  `/join#token=${token}&invited-by=${INVITER}`;

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

// The own server's answer to the federation check.
function ownKey(page: Page, status: number, body: unknown = KEY_SET) {
  return page.route("**/users/federation/key", (route) =>
    route.fulfill({
      status,
      contentType: "application/jwk-set+json",
      body: JSON.stringify(body),
    }),
  );
}

// The server the invitee types in.
function remoteKey(
  page: Page,
  respond: Parameters<typeof page.route>[1] extends infer H ? H : never,
) {
  return page.route(`${REMOTE}/users/federation/key`, respond);
}

test("the own server's federation key is a contract", async ({ page }) => {
  await provider
    .addInteraction()
    .uponReceiving("a request of the invitation page for the federation key")
    .withRequest("GET", "/users/federation/key")
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/jwk-set+json" }).jsonBody({
        keys: MatchersV3.eachLike({
          kty: "EC",
          crv: "P-256",
          kid: MatchersV3.string("kid-1"),
          x: MatchersV3.string(KEY_SET.keys[0].x),
          y: MatchersV3.string(KEY_SET.keys[0].y),
        }),
      }),
    )
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.goto(joinUrl());
      await expect(
        page.getByText("I already have an account on another server"),
      ).toBeVisible();
    });
});

test("shows the invited address and registers here by form post", async ({
  page,
}) => {
  await ownKey(page, 404, {});
  let body: string | null = null;
  let path = "";
  await page.route("**/invitations/*/registration", (route) => {
    body = route.request().postData();
    path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: 303,
      headers: { Location: "/?email=bob@b.test&userId=u1&inviter=" + INVITER },
    });
  });
  const token = invitationToken();

  await page.goto(joinUrl(token));

  await expect(page.getByText("bob@b.test")).toBeVisible();
  // The own server does not federate: only one option.
  await expect(
    page.getByText("I already have an account on another server"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Create an account here" }).click();
  await expect(page).toHaveURL(/userId=u1/);
  expect(path).toBe(`/invitations/${token}/registration`);
  expect(body).toBe(`invited-by=${INVITER}`);
});

test("an address with umlauts is shown as it is", async ({ page }) => {
  await ownKey(page, 404, {});

  await page.goto(joinUrl(invitationToken("jürgen@müller.de")));

  await expect(page.getByText("jürgen@müller.de")).toBeVisible();
});

test("an undecodable token only hides the address", async ({ page }) => {
  await ownKey(page, 404, {});

  await page.goto(`/join#token=not-a-jwt&invited-by=${INVITER}`);

  await expect(
    page.getByRole("button", { name: "Create an account here" }),
  ).toBeVisible();
});

test("without a fragment the link is reported as invalid", async ({ page }) => {
  await ownKey(page, 404, {});

  await page.goto("/join");

  await expect(page.getByText("Invalid invitation link")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create an account here" }),
  ).toHaveCount(0);
});

test("a federation check that fails hides the second option", async ({
  page,
}) => {
  await page.route("**/users/federation/key", (route) => route.abort());

  await page.goto(joinUrl());

  await expect(
    page.getByRole("button", { name: "Create an account here" }),
  ).toBeVisible();
  await expect(
    page.getByText("I already have an account on another server"),
  ).toHaveCount(0);
});

test("a typed server is normalized, checked and the invitation handed over", async ({
  page,
}) => {
  await ownKey(page, 200);
  await remoteKey(page, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      contentType: "application/jwk-set+json",
      body: JSON.stringify(KEY_SET),
    }),
  );
  // The target page of the redirect.
  await page.route(`${REMOTE}/federation/accept**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "accept" }),
  );
  const token = invitationToken();

  await page.goto(joinUrl(token));
  await page.getByLabel("Server").fill("HTTPS://Remote.Test/foo");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL(`${REMOTE}/federation/accept#**`);
  const fragment = new URLSearchParams(new URL(page.url()).hash.slice(1));
  expect(fragment.get("token")).toBe(token);
  expect(fragment.get("invited-by")).toBe(INVITER);
  expect(fragment.get("from")).toBe("http://localhost:5173");
});

for (const input of ["a b", "ftp://remote.test", "https://user@remote.test"]) {
  test(`the server address "${input}" is rejected`, async ({ page }) => {
    await ownKey(page, 200);

    await page.goto(joinUrl());
    await page.getByLabel("Server").fill(input);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Invalid server address")).toBeVisible();
    await expect(page).toHaveURL(/\/join#/);
  });
}

test("plain http is only accepted for localhost", async ({ page }) => {
  await ownKey(page, 200);

  await page.goto(joinUrl());
  await page.getByLabel("Server").fill("http://remote.test");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Invalid server address")).toBeVisible();
});

test("the continue button needs an input", async ({ page }) => {
  await ownKey(page, 200);

  await page.goto(joinUrl());

  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

const unusable: [string, Parameters<typeof remoteKey>[1]][] = [
  [
    "answers 404",
    (route) => route.fulfill({ status: 404, headers: CORS, body: "" }),
  ],
  ["does not answer", (route) => route.abort()],
  [
    "answers no JSON",
    (route) =>
      route.fulfill({ status: 200, headers: CORS, body: "<html></html>" }),
  ],
  [
    "publishes no key",
    (route) =>
      route.fulfill({
        status: 200,
        headers: CORS,
        contentType: "application/json",
        body: JSON.stringify({ keys: [] }),
      }),
  ],
  [
    "publishes a null key set",
    (route) =>
      route.fulfill({
        status: 200,
        headers: CORS,
        contentType: "application/json",
        body: "null",
      }),
  ],
];
for (const [name, respond] of unusable) {
  test(`a server that ${name} is not accepted`, async ({ page }) => {
    await ownKey(page, 200);
    await remoteKey(page, respond);

    await page.goto(joinUrl());
    await page.getByLabel("Server").fill(REMOTE);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText("No compatible server was found at this address"),
    ).toBeVisible();
    await expect(page).toHaveURL(/localhost:5173\/join#/);
  });
}

test("the own server is rejected", async ({ page }) => {
  await ownKey(page, 200);

  await page.goto(joinUrl());
  await page.getByLabel("Server").fill("localhost:5173");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText("This is this server - please choose the first option"),
  ).toBeVisible();
});
