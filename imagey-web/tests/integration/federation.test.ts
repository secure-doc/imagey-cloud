import { Page, Route } from "@playwright/test";
import { MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  MARY_ID,
  prepareMarysDocuments,
  prepareMarysEmptyContactRequests,
  prepareMarysLogin,
  provider,
  runningPactRequests,
  setupMockServer,
} from "./setup";
import type { createFederationGuestTokenProvider } from "../../src/federation/federationGuestTokenProvider";
import type {} from "../../src/main";

declare global {
  interface Window {
    fedProvider: ReturnType<typeof createFederationGuestTokenProvider>;
  }
}

const REMOTE = "https://remote.test";
const MARY_EMAIL = "mary@imagey.cloud";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Location, ETag, Last-Modified",
};

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

// The foreign server is stubbed with page.route: error paths and renewals do not
// belong into a Pact contract (see AGENTS.md). Only asking the own server for an
// assertion is a contract (the first test).
async function stubRemote(
  page: Page,
  respond: (seen: Seen) => Parameters<Route["fulfill"]>[0],
): Promise<Seen[]> {
  const requests: Seen[] = [];
  await page.route(`${REMOTE}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE",
          "Access-Control-Allow-Headers":
            "authorization, access-path, content-type, prefer, notify, if-match",
        },
      });
      return;
    }
    const seen = {
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postData(),
    };
    requests.push(seen);
    const response = respond(seen);
    await route.fulfill({
      ...response,
      headers: { ...CORS, ...response.headers },
    });
  });
  return requests;
}

const session = (token: string) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ token, userId: "mary-on-remote", expiresIn: 900 }),
});

// The own server: hands out an "assertion" (a stand-in; the real one is the Pact test).
async function stubLocal(page: Page, status = 200): Promise<Seen[]> {
  const requests: Seen[] = [];
  await page.route(/\/users\/[^/]+\/federation-assertions$/, async (route) => {
    const request = route.request();
    requests.push({
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postData(),
    });
    await route.fulfill(
      status === 200
        ? {
            status,
            contentType: "application/json",
            body: JSON.stringify({ assertion: "a.b.c" }),
          }
        : { status },
    );
  });
  return requests;
}

function installProvider(page: Page, email: string | null = MARY_EMAIL) {
  return page.evaluate(
    ({ userId, email }) => {
      window.fedProvider = window.federation.createFederationGuestTokenProvider(
        () => ({ userId, email }),
      );
      window.remoteApi.setGuestTokenProvider(window.fedProvider);
      window.remoteApi.guestSessionStore.clear();
    },
    { userId: MARY_ID, email: email ?? undefined },
  );
}

const failure = (page: Page, action: () => Promise<unknown>) =>
  page.evaluate(
    (fn) =>
      (eval(fn) as () => Promise<unknown>)().then(
        () => undefined,
        (e: { name: string; status?: number }) => ({
          name: e.name,
          status: e.status,
        }),
      ),
    action.toString(),
  );

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html?empty");
});

test("mary asks her server for an assertion for another server", async ({
  page,
}) => {
  await provider
    .addInteraction()
    .uponReceiving("a request of mary for an assertion for another server")
    .withRequest("POST", `/users/${MARY_ID}/federation-assertions`, (r) =>
      r
        .headers({
          "Content-Type": "application/json",
          Accept: "application/json",
        })
        .jsonBody({ aud: "remote.test", email: MARY_EMAIL }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        assertion: MatchersV3.regex(
          "^[\\w-]+\\.[\\w-]+\\.[\\w-]+$",
          "eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJhIn0.c2ln",
        ),
      }),
    )
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);

      const assertion = await page.evaluate(
        ({ userId, email }) =>
          window.federation.federationRepository.mintAssertion(
            userId,
            "remote.test",
            email,
          ),
        { userId: MARY_ID, email: MARY_EMAIL },
      );

      expect(assertion).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });
});

test("renew asks for an assertion and redeems it without any credentials", async ({
  page,
}) => {
  await page
    .context()
    .addCookies([
      { name: "session", value: "secret", url: "http://localhost" },
    ]);
  const local = await stubLocal(page);
  const remote = await stubRemote(page, () => session("g1"));
  await installProvider(page);

  const [result, before] = await page.evaluate(
    async (origin) =>
      [await window.fedProvider.renew(origin), Date.now()] as const,
    REMOTE,
  );

  expect(local).toHaveLength(1);
  expect(local[0].url).toMatch(`/users/${MARY_ID}/federation-assertions`);
  expect(JSON.parse(local[0].body!)).toEqual({
    aud: "remote.test",
    email: MARY_EMAIL,
  });
  expect(remote).toHaveLength(1);
  expect(remote[0].method).toBe("POST");
  expect(remote[0].url).toBe(`${REMOTE}/users/federation/sessions`);
  expect(remote[0].headers["authorization"]).toBeUndefined();
  expect(remote[0].headers["cookie"]).toBeUndefined();
  expect(JSON.parse(remote[0].body!)).toEqual({ assertion: "a.b.c" });
  expect(result).toMatchObject({
    origin: REMOTE,
    token: "g1",
    userId: "mary-on-remote",
  });
  expect(result.expiresAt - before).toBeGreaterThan(895_000);
  expect(result.expiresAt - before).toBeLessThanOrEqual(900_000);
});

test("redeeming an invitation sends it, and renewing uses the address it was redeemed with", async ({
  page,
}) => {
  const local = await stubLocal(page);
  const remote = await stubRemote(page, () => session("g1"));
  await installProvider(page);

  const redeemed = await page.evaluate(
    (origin) =>
      window.fedProvider.redeemInvitation(origin, "invitation", "me@work.test"),
    REMOTE,
  );
  await page.evaluate((origin) => window.fedProvider.renew(origin), REMOTE);

  expect(JSON.parse(remote[0].body!)).toEqual({
    assertion: "a.b.c",
    invitationToken: "invitation",
  });
  expect(JSON.parse(remote[1].body!)).toEqual({ assertion: "a.b.c" });
  expect(local.map((r) => JSON.parse(r.body!).email)).toEqual([
    "me@work.test",
    "me@work.test",
  ]);
  expect(redeemed.token).toBe("g1");
  expect(
    await page.evaluate(
      (origin) => window.remoteApi.guestSessionStore.get(origin)?.token,
      REMOTE,
    ),
  ).toBe("g1");
});

test("a remembered address is used for renewing, whatever the account's own address is", async ({
  page,
}) => {
  const local = await stubLocal(page);
  await stubRemote(page, () => session("g1"));
  await installProvider(page);

  await page.evaluate(
    (origin) => window.fedProvider.rememberAddress(origin, "alias@work.test"),
    REMOTE,
  );
  await page.evaluate((origin) => window.fedProvider.renew(origin), REMOTE);

  expect(JSON.parse(local[0].body!).email).toBe("alias@work.test");
});

test("without an address there is no federation, and no request", async ({
  page,
}) => {
  const local = await stubLocal(page);
  const remote = await stubRemote(page, () => session("g1"));
  await installProvider(page, null);

  const error = await failure(page, () =>
    window.fedProvider.renew("https://remote.test"),
  );

  expect(error).toEqual({
    name: "FederationUnavailableError",
    status: undefined,
  });
  expect(local).toHaveLength(0);
  expect(remote).toHaveLength(0);
});

test("a refused assertion is a 401 for the caller", async ({ page }) => {
  await stubLocal(page);
  await stubRemote(page, () => ({ status: 401, body: "{}" }));
  await installProvider(page);

  const error = await failure(page, () =>
    window.fedProvider.renew("https://remote.test"),
  );

  expect(error).toEqual({ name: "HttpError", status: 401 });
});

test("when the own server refuses, nothing is redeemed", async ({ page }) => {
  await stubLocal(page, 403);
  const remote = await stubRemote(page, () => session("g1"));
  await installProvider(page);

  const error = await failure(page, () =>
    window.fedProvider.renew("https://remote.test"),
  );

  expect(error).toEqual({ name: "HttpError", status: 403 });
  expect(remote).toHaveLength(0);
});

test("a request to another server first gets a session, then goes out with it", async ({
  page,
}) => {
  const local = await stubLocal(page);
  const remote = await stubRemote(page, (seen) =>
    seen.url.endsWith("/sessions")
      ? session("g1")
      : { status: 200, contentType: "application/octet-stream", body: "x" },
  );
  await installProvider(page);

  await page.evaluate(
    (origin) =>
      window.remoteApi.repositoriesFor(origin).documents.loadDocument("u", "d"),
    REMOTE,
  );

  expect(local).toHaveLength(1);
  expect(remote.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
    "POST /users/federation/sessions",
    "GET /users/u/documents/d",
  ]);
  expect(remote[1].headers["authorization"]).toBe("Bearer g1");
});

test("when the user changes, remembered addresses and sessions are gone", async ({
  page,
}) => {
  await stubLocal(page);
  await stubRemote(page, () => session("g1"));
  await installProvider(page, null);
  await page.evaluate(
    (origin) => window.fedProvider.rememberAddress(origin, "alias@work.test"),
    REMOTE,
  );
  await page.evaluate(
    (origin) =>
      window.remoteApi.guestSessionStore.set({
        origin,
        token: "old",
        userId: "x",
        expiresAt: Date.now() + 600_000,
      }),
    REMOTE,
  );

  await page.evaluate(() => window.remoteApi.guestSessionStore.clear());

  expect(
    await page.evaluate(
      (origin) => window.remoteApi.guestSessionStore.get(origin),
      REMOTE,
    ),
  ).toBeUndefined();
  const error = await failure(page, () =>
    window.fedProvider.renew("https://remote.test"),
  );
  expect(error).toEqual({
    name: "FederationUnavailableError",
    status: undefined,
  });
});

test("the signed-in app gets guest sessions on behalf of the user", async ({
  page,
}) => {
  await clearLocalStorage(page);
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const contactRequests = await prepareMarysEmptyContactRequests();

  await contactRequests.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    // registered after the mock server's route, so it takes precedence for this request
    const local = await stubLocal(page);
    const remote = await stubRemote(page, (seen) =>
      seen.url.endsWith("/sessions")
        ? session("g1")
        : { status: 200, contentType: "application/octet-stream", body: "x" },
    );

    await page.evaluate(
      (origin) =>
        window.remoteApi
          .repositoriesFor(origin)
          .documents.loadDocument("u", "d"),
      REMOTE,
    );

    expect(JSON.parse(local[0].body!)).toEqual({
      aud: "remote.test",
      email: MARY_EMAIL,
    });
    expect(remote[1].headers["authorization"]).toBe("Bearer g1");
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
