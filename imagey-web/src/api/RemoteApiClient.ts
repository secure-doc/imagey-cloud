import { ApiClient } from "./ApiClient";
import { guestSessionStore } from "./GuestSessionStore";
import {
  GuestTokenProvider,
  unavailableGuestTokenProvider,
} from "./GuestTokenProvider";

// Renew proactively when the token expires within this time ...
const RENEW_MARGIN_MS = 60_000;
// ... but never earlier than half its lifetime: a provider with a short TTL must not
// cause a renewal per request.

export function parseOrigin(origin: string): string {
  const url = new URL(origin);
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname.endsWith(".localhost")));
  if (
    !secure ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new TypeError("Invalid remote origin: " + origin);
  }
  return url.origin;
}

// Talks to another server with a guest bearer token and no cookies (ADR 0013
// decisions 4 and 6): renews once on 401, never on 403.
export function createRemoteApiClient(
  origin: string,
  provider: GuestTokenProvider = unavailableGuestTokenProvider,
  store = guestSessionStore,
  now: () => number = Date.now,
): ApiClient {
  const serverOrigin = parseOrigin(origin);
  let lifetime: number | undefined; // of the last renewed session, ms
  const margin = () =>
    lifetime === undefined
      ? RENEW_MARGIN_MS
      : Math.min(RENEW_MARGIN_MS, lifetime / 2);
  let renewing: { generation: number; promise: Promise<string> } | undefined;

  // Single-flight: concurrent renewals share one promise. A renewal that started
  // before store.clear() (logout) is neither joined nor stored: its token belongs
  // to the previous user.
  const renew = (): Promise<string> => {
    const generation = store.generation();
    if (renewing?.generation === generation) {
      return renewing.promise;
    }
    const promise = provider.renew(serverOrigin).then((session) => {
      lifetime = session.expiresAt - now();
      if (store.generation() === generation) {
        store.set({ ...session, origin: serverOrigin });
      }
      return session.token;
    });
    const current = { generation, promise };
    renewing = current;
    const forget = () => {
      if (renewing === current) renewing = undefined;
    };
    promise.then(forget, forget);
    return promise;
  };

  // The token to retry with after `rejected` got a 401: one that was stored
  // meanwhile (another request renewed already), else a fresh one.
  const retryToken = (rejected: string): Promise<string> => {
    const session = store.get(serverOrigin);
    if (
      session &&
      session.token !== rejected &&
      session.expiresAt - now() >= margin()
    ) {
      return Promise.resolve(session.token);
    }
    return renew();
  };

  const currentToken = async (): Promise<string> => {
    const session = store.get(serverOrigin);
    if (!session || session.expiresAt - now() < margin()) {
      return renew();
    }
    return session.token;
  };

  const send = (url: string, init: RequestInit | undefined, token: string) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", "Bearer " + token);
    return fetch(url, {
      ...init,
      mode: "cors",
      credentials: "omit",
      headers,
    });
  };

  return {
    fetch: async (path, init) => {
      // Judge the URL the browser will request: fetch normalizes "/users/../x".
      const url = new URL(path, serverOrigin);
      if (url.origin !== serverOrigin || !url.pathname.startsWith("/users/")) {
        throw new TypeError("Path must start with /users/: " + path);
      }
      const generation = store.generation();
      const token = await currentToken();
      const response = await send(url.href, init, token);
      // A stream body is consumed by the first attempt and cannot be replayed.
      // After a logout (clear) the request belongs to the previous user: a retry
      // would use the token of whoever signed in since.
      if (
        response.status !== 401 ||
        init?.body instanceof ReadableStream ||
        store.generation() !== generation
      ) {
        return response;
      }
      return send(url.href, init, await retryToken(token));
    },
  };
}
