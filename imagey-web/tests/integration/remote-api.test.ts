import { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import { TestData } from "./setup";
import type {} from "../../src/main";

declare global {
  interface Window {
    renews: number;
    nextExpiresIn: number;
  }
}

// The guest API of a foreign server is stubbed with page.route (error and renewal
// paths do not belong into a Pact contract, see AGENTS.md). Tokens are t1, t2, ...
const REMOTE = "https://remote.test";
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

async function stubRemote(
  page: Page,
  respond: (
    seen: Seen,
    count: number,
  ) =>
    | Parameters<Route["fulfill"]>[0]
    | Promise<Parameters<Route["fulfill"]>[0]>,
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
    const response = await respond(seen, requests.length);
    await route.fulfill({
      ...response,
      headers: { ...CORS, ...response.headers },
    });
  });
  return requests;
}

// Provider that hands out t1, t2, ... valid for `nextExpiresIn` ms (default 15 min).
async function installProvider(page: Page) {
  await page.evaluate((origin) => {
    window.renews = 0;
    window.nextExpiresIn = 15 * 60_000;
    window.remoteApi.setGuestTokenProvider({
      renew: async () => {
        window.renews++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          origin,
          token: "t" + window.renews,
          userId: "me-on-remote",
          expiresAt: Date.now() + window.nextExpiresIn,
        };
      },
    });
  }, REMOTE);
}

const renews = (page: Page) => page.evaluate(() => window.renews);

const ok = { status: 200, contentType: "application/octet-stream", body: "x" };

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html?empty");
  await installProvider(page);
  await page.evaluate(() => window.remoteApi.guestSessionStore.clear());
});

function loadDocument(page: Page, accessPath?: string) {
  return page.evaluate(
    async ([origin, accessPath]) => {
      const documents = window.remoteApi.repositoriesFor(origin!).documents;
      return documents
        .loadDocument("u", "d", accessPath)
        .then((r) => ({ ok: true, etag: r.etag }))
        .catch((e) => ({ ok: false, name: e.name, status: e.status }));
    },
    [REMOTE, accessPath],
  );
}

test("remote request carries the bearer token, no cookie", async ({ page }) => {
  await page
    .context()
    .addCookies([
      { name: "session", value: "secret", url: "http://localhost" },
    ]);
  const requests = await stubRemote(page, () => ({
    ...ok,
    headers: { ETag: '"e1"' },
  }));
  await page.evaluate(
    (origin) =>
      window.remoteApi.guestSessionStore.set({
        origin,
        token: "t1",
        userId: "me",
        expiresAt: Date.now() + 600_000,
      }),
    REMOTE,
  );

  const result = await loadDocument(page, "path");

  expect(result).toEqual({ ok: true, etag: '"e1"' });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(`${REMOTE}/users/u/documents/d`);
  expect(requests[0].headers["authorization"]).toBe("Bearer t1");
  expect(requests[0].headers["access-path"]).toBe("path");
  expect(requests[0].headers["cookie"]).toBeUndefined();
  expect(await renews(page)).toBe(0);
});

test("a missing token is fetched before the request", async ({ page }) => {
  const requests = await stubRemote(page, () => ok);
  await loadDocument(page);
  expect(await renews(page)).toBe(1);
  expect(requests[0].headers["authorization"]).toBe("Bearer t1");
});

test("a token expiring within 60 s is renewed proactively", async ({
  page,
}) => {
  const requests = await stubRemote(page, () => ok);
  await page.evaluate(
    (origin) =>
      window.remoteApi.guestSessionStore.set({
        origin,
        token: "old",
        userId: "me",
        expiresAt: Date.now() + 30_000,
      }),
    REMOTE,
  );
  await loadDocument(page);
  expect(await renews(page)).toBe(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].headers["authorization"]).toBe("Bearer t1");
});

test("401 renews once and retries with the new token", async ({ page }) => {
  const requests = await stubRemote(page, (_, count) =>
    count === 1 ? { status: 401 } : ok,
  );
  const result = await loadDocument(page);
  expect(result.ok).toBe(true);
  expect(await renews(page)).toBe(2);
  expect(requests.map((r) => r.headers["authorization"])).toEqual([
    "Bearer t1",
    "Bearer t2",
  ]);
});

test("a second 401 is handed to the repository", async ({ page }) => {
  const requests = await stubRemote(page, () => ({ status: 401 }));
  const result = await loadDocument(page);
  expect(result).toEqual({ ok: false, name: "HttpError", status: 401 });
  expect(requests).toHaveLength(2);
  expect(await renews(page)).toBe(2);
});

test("403 is never renewed", async ({ page }) => {
  const requests = await stubRemote(page, () => ({ status: 403 }));
  const result = await loadDocument(page);
  expect(result).toEqual({ ok: false, name: "HttpError", status: 403 });
  expect(requests).toHaveLength(1);
  expect(await renews(page)).toBe(1);
});

test("parallel 401s share a single renewal", async ({ page }) => {
  const requests = await stubRemote(page, (seen) =>
    seen.headers["authorization"] === "Bearer old" ? { status: 401 } : ok,
  );
  // "old" is in the store, so the three requests start with it and all get 401
  await page.evaluate(
    (origin) =>
      window.remoteApi.guestSessionStore.set({
        origin,
        token: "old",
        userId: "me",
        expiresAt: Date.now() + 600_000,
      }),
    REMOTE,
  );
  const results = await page.evaluate(async (origin) => {
    const documents = window.remoteApi.repositoriesFor(origin).documents;
    const all = await Promise.all(
      [1, 2, 3].map((i) => documents.loadDocument("u", "d" + i)),
    );
    return all.length;
  }, REMOTE);
  expect(results).toBe(3);
  expect(await renews(page)).toBe(1);
  expect(requests).toHaveLength(6);
});

test("a failing provider reaches the caller and leaves the store alone", async ({
  page,
}) => {
  const requests = await stubRemote(page, () => ok);
  const result = await page.evaluate(async (origin) => {
    window.remoteApi.setGuestTokenProvider({
      renew: () =>
        Promise.reject(new window.remoteApi.FederationUnavailableError("no")),
    });
    const documents = window.remoteApi.repositoriesFor(origin).documents;
    const error = await documents.loadDocument("u", "d").catch((e) => e);
    return {
      name: error.name,
      stored: window.remoteApi.guestSessionStore.get(origin),
    };
  }, REMOTE);
  expect(result).toEqual({ name: "FederationUnavailableError" });
  expect(requests).toHaveLength(0);
});

test("a POST body is sent identically when retried", async ({ page }) => {
  const requests = await stubRemote(page, (_, count) =>
    count === 1
      ? { status: 401 }
      : {
          status: 201,
          contentType: "application/json",
          headers: { Location: `${REMOTE}/users/o/documents/c/messages/m1` },
          body: JSON.stringify({ timestamp: "2026-01-01T00:00:00Z" }),
        },
  );
  const result = await page.evaluate(async (origin) => {
    const messages = window.remoteApi.repositoriesFor(origin).messages;
    return messages.sendMessage("o", "c", "cipher", ["bob"]);
  }, REMOTE);
  expect(result).toEqual({ id: "m1", timestamp: "2026-01-01T00:00:00Z" });
  expect(requests.map((r) => r.body)).toEqual(["cipher", "cipher"]);
  expect(requests[1].headers["notify"]).toBe("bob");
});

test("a stream body is not replayed after a 401", async ({ page }) => {
  const requests = await stubRemote(page, () => ({ status: 401 }));
  const status = await page.evaluate(async (origin) => {
    const client = window.remoteApi.createRemoteApiClient(
      origin,
      {
        renew: async () => ({
          origin,
          token: "t",
          userId: "me",
          expiresAt: Date.now() + 600_000,
        }),
      },
      window.remoteApi.guestSessionStore,
    );
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x"));
        controller.close();
      },
    });
    try {
      const response = await client.fetch("/users/u/documents", {
        method: "POST",
        body,
        // @ts-expect-error duplex is required for stream bodies
        duplex: "half",
      });
      return response.status;
    } catch (e) {
      return (e as Error).name;
    }
  }, REMOTE);
  // Chromium rejects stream bodies over HTTP/1.1; either way there is no replay.
  expect([401, "TypeError"]).toContain(status);
  expect(requests.length).toBeLessThanOrEqual(1);
});

test("the store is empty after clear()", async ({ page }) => {
  const stored = await page.evaluate((origin) => {
    const store = window.remoteApi.guestSessionStore;
    store.set({ origin, token: "t", userId: "me", expiresAt: 1 });
    store.clear();
    return store.get(origin);
  }, REMOTE);
  expect(stored).toBeUndefined();
});

test("a switched user drops all guest sessions", async ({ page }) => {
  await page.route("**/users/*/public-keys/0", (route) =>
    route.fulfill({ json: TestData.mary.publicMainKey }),
  );
  await page.goto(
    "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
  );
  await page.evaluate((origin) => {
    window.remoteApi.guestSessionStore.set({
      origin,
      token: "t",
      userId: "me",
      expiresAt: Date.now() + 600_000,
    });
  }, REMOTE);
  await page.getByText("Sign in with a different email").click();
  const stored = await page.evaluate(
    (origin) => window.remoteApi.guestSessionStore.get(origin),
    REMOTE,
  );
  expect(stored).toBeUndefined();
});

test("origins are validated", async ({ page }) => {
  const results = await page.evaluate(() => {
    const create = (origin: string) => {
      try {
        window.remoteApi.createRemoteApiClient(origin);
        return "ok";
      } catch (e) {
        return (e as Error).name;
      }
    };
    return [
      "https://x.test/path",
      "https://x.test/?q=1",
      "https://x.test/#f",
      "https://user:pw@x.test",
      "ftp://x",
      "http://x.test",
      "http://b.localhost:8081",
      "http://localhost:8081",
      "https://x.test",
    ].map(create);
  });
  expect(results).toEqual([
    "TypeError",
    "TypeError",
    "TypeError",
    "TypeError",
    "TypeError",
    "TypeError",
    "ok",
    "ok",
    "ok",
  ]);
});

test("paths outside /users/ are refused without a request", async ({
  page,
}) => {
  const requests = await stubRemote(page, () => ok);
  const name = await page.evaluate(async (origin) => {
    const client = window.remoteApi.createRemoteApiClient(origin);
    return client.fetch("/manifest.json").catch((e) => e.name);
  }, REMOTE);
  expect(name).toBe("TypeError");
  expect(requests).toHaveLength(0);
});

test("receiveMessages sends Prefer and Authorization", async ({ page }) => {
  const requests = await stubRemote(page, () => ({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
  await page.evaluate(
    (origin) =>
      window.remoteApi
        .repositoriesFor(origin)
        .messages.receiveMessages("o", "c", "since", 5),
    REMOTE,
  );
  expect(requests[0].url).toBe(
    `${REMOTE}/users/o/documents/c/messages?sinceId=since`,
  );
  expect(requests[0].headers["prefer"]).toBe("wait=5");
  expect(requests[0].headers["authorization"]).toBe("Bearer t1");
});

test("repositoriesFor shares the own repositories and caches remote ones", async ({
  page,
}) => {
  const result = await page.evaluate((origin) => {
    const api = window.remoteApi;
    const own = api.repositoriesFor();
    const sameOrigin = api.repositoriesFor(window.location.origin);
    return {
      ownEqual:
        own.documents === sameOrigin.documents &&
        own.messages === sameOrigin.messages &&
        own.contacts === sameOrigin.contacts,
      cached: api.repositoriesFor(origin) === api.repositoriesFor(origin),
      remoteDiffers: api.repositoriesFor(origin).documents !== own.documents,
    };
  }, REMOTE);
  expect(result).toEqual({
    ownEqual: true,
    cached: true,
    remoteDiffers: true,
  });
});

test("contact requests work against a remote server", async ({ page }) => {
  const requests = await stubRemote(page, () => ({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
  const result = await page.evaluate(
    (origin) =>
      window.remoteApi
        .repositoriesFor(origin)
        .contacts.getContactRequests("u" as never),
    REMOTE,
  );
  expect(result).toEqual([]);
  expect(requests[0].url).toBe(`${REMOTE}/users/u/contact-requests`);
});

test("a renewal that was in flight during clear() is not stored", async ({
  page,
}) => {
  await stubRemote(page, () => ok);
  const result = await page.evaluate(async (origin) => {
    const api = window.remoteApi;
    // slow provider: the renewal is still running when the user logs out
    api.setGuestTokenProvider({
      renew: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          origin,
          token: "of-user-a",
          userId: "a",
          expiresAt: Date.now() + 600_000,
        };
      },
    });
    const documents = api.repositoriesFor(origin).documents;
    const pending = documents.loadDocument("u", "d");
    await new Promise((resolve) => setTimeout(resolve, 20));
    api.guestSessionStore.clear();
    await pending;
    return api.guestSessionStore.get(origin);
  }, REMOTE);
  expect(result).toBeUndefined();
});

test("after clear() a new request does not join the old renewal", async ({
  page,
}) => {
  const requests = await stubRemote(page, () => ok);
  await page.evaluate(async (origin) => {
    const api = window.remoteApi;
    let calls = 0;
    api.setGuestTokenProvider({
      renew: async () => {
        const token = "user-" + ++calls;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { origin, token, userId: "x", expiresAt: Date.now() + 600_000 };
      },
    });
    const documents = api.repositoriesFor(origin).documents;
    const first = documents.loadDocument("u", "d1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    api.guestSessionStore.clear();
    await Promise.all([first, documents.loadDocument("u", "d2")]);
  }, REMOTE);
  const byDocument = Object.fromEntries(
    requests.map((r) => [r.url.split("/").pop(), r.headers["authorization"]]),
  );
  expect(byDocument).toEqual({ d1: "Bearer user-1", d2: "Bearer user-2" });
});

test("a late 401 uses the token another request already renewed", async ({
  page,
}) => {
  // d2's 401 arrives only after d1 has renewed and retried with t1
  let renewed!: () => void;
  const retried = new Promise<void>((resolve) => (renewed = resolve));
  const requests = await stubRemote(page, async (seen) => {
    const token = seen.headers["authorization"];
    if (token === "Bearer t1") {
      renewed();
      return ok;
    }
    if (seen.url.endsWith("/d2")) await retried;
    return { status: 401 };
  });
  await page.evaluate(
    (origin) =>
      window.remoteApi.guestSessionStore.set({
        origin,
        token: "old",
        userId: "me",
        expiresAt: Date.now() + 600_000,
      }),
    REMOTE,
  );
  await page.evaluate(async (origin) => {
    const documents = window.remoteApi.repositoriesFor(origin).documents;
    await Promise.all([
      documents.loadDocument("u", "d1"),
      documents.loadDocument("u", "d2"),
    ]);
  }, REMOTE);
  expect(await renews(page)).toBe(1);
  expect(
    requests.map(
      (r) => r.url.split("/").pop() + " " + r.headers["authorization"],
    ),
  ).toEqual(["d1 Bearer old", "d2 Bearer old", "d1 Bearer t1", "d2 Bearer t1"]);
});

test("a 401 after logout is not retried with the next user's token", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requests = await stubRemote(page, async () => {
    await gate;
    return { status: 401 };
  });
  const pending = page.evaluate(async (origin) => {
    const api = window.remoteApi;
    api.guestSessionStore.set({
      origin,
      token: "user-a",
      userId: "a",
      expiresAt: Date.now() + 600_000,
    });
    const error = await api
      .repositoriesFor(origin)
      .documents.loadDocument("u", "d")
      .catch((e) => e);
    return error.status;
  }, REMOTE);
  await expect.poll(() => requests.length).toBe(1);
  await page.evaluate((origin) => {
    const store = window.remoteApi.guestSessionStore;
    store.clear(); // user A logs out ...
    store.set({
      origin,
      token: "user-b",
      userId: "b",
      expiresAt: Date.now() + 600_000,
    }); // ... and user B logs in
  }, REMOTE);
  release();
  expect(await pending).toBe(401);
  expect(requests).toHaveLength(1);
  expect(await renews(page)).toBe(0);
});

test("repositoriesFor normalizes the origin", async ({ page }) => {
  const result = await page.evaluate((origin) => {
    const api = window.remoteApi;
    return {
      own:
        api.repositoriesFor(window.location.origin + "/").documents ===
        api.repositoriesFor().documents,
      cached:
        api.repositoriesFor(origin + "/") ===
        api.repositoriesFor(origin.toUpperCase()),
    };
  }, REMOTE);
  expect(result).toEqual({ own: true, cached: true });
});

test("a path that leaves /users/ is refused", async ({ page }) => {
  const requests = await stubRemote(page, () => ok);
  const names = await page.evaluate(async (origin) => {
    const client = window.remoteApi.createRemoteApiClient(origin);
    const attempt = (path: string) =>
      client.fetch(path).then(
        () => "sent",
        (e) => e.name,
      );
    return [
      await attempt("/users/../manifest.json"),
      await attempt("//evil.test/users/x"),
    ];
  }, REMOTE);
  expect(names).toEqual(["TypeError", "TypeError"]);
  expect(requests).toHaveLength(0);
});

test("a provider with a short TTL does not renew on every request", async ({
  page,
}) => {
  const requests = await stubRemote(page, () => ok);
  await page.evaluate(async (origin) => {
    window.remoteApi.setGuestTokenProvider({
      renew: async () => {
        window.renews++;
        return {
          origin,
          token: "t" + window.renews,
          userId: "me",
          expiresAt: Date.now() + 30_000, // below the 60 s margin
        };
      },
    });
    const documents = window.remoteApi.repositoriesFor(origin).documents;
    await documents.loadDocument("u", "d1");
    await documents.loadDocument("u", "d2");
  }, REMOTE);
  expect(await renews(page)).toBe(1);
  expect(requests.map((r) => r.headers["authorization"])).toEqual([
    "Bearer t1",
    "Bearer t1",
  ]);
});
