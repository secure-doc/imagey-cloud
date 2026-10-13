import { parseOrigin } from "../api/RemoteApiClient";

const KEY_PATH = "/users/federation/key";
const VERIFY_TIMEOUT_MS = 5_000;
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const HOST =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name.endsWith(".localhost");
}

// What a user typed for "my server" (ADR 0013 A2) as an origin: scheme and path dropped, host in
// lower case. https is assumed; plain http only for *.localhost (E2E), like parseOrigin.
export function normalizeServer(input: string): string {
  const trimmed = input.trim();
  const scheme = SCHEME.exec(trimmed);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    throw new TypeError("Invalid server: " + input);
  }
  const rest = scheme ? trimmed.slice(scheme[0].length) : trimmed;
  const host = rest.split(/[/?#]/, 1)[0];
  if (!HOST.test(host)) {
    throw new TypeError("Invalid server: " + input);
  }
  const protocol = scheme
    ? scheme[1].toLowerCase()
    : isLocalHost(host)
      ? "http"
      : "https";
  try {
    return parseOrigin(`${protocol}://${host.toLowerCase()}`);
  } catch {
    throw new TypeError("Invalid server: " + input);
  }
}

function hasEcKey(body: unknown): boolean {
  const keys = (body as { keys?: unknown } | null)?.keys;
  return (
    Array.isArray(keys) &&
    keys.some((key) => (key as { kty?: unknown } | null)?.kty === "EC")
  );
}

// Asks the server at `origin` for its federation key (ADR 0013 A9, public, no credentials): a
// server that publishes one speaks the protocol. "unreachable" = no answer at all (network,
// CORS, timeout), "invalid" = an answer that is no federation key.
export async function verifyServer(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"ok" | "unreachable" | "invalid"> {
  let response: Response;
  try {
    response = await fetchImpl(origin + KEY_PATH, {
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/jwk-set+json, application/json" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch {
    return "unreachable";
  }
  if (!response.ok) {
    return "invalid";
  }
  try {
    return hasEcKey(await response.json()) ? "ok" : "invalid";
  } catch {
    return "invalid";
  }
}

// Whether the own server federates at all (404 while federation is switched off).
export async function federationAvailable(): Promise<boolean> {
  try {
    const response = await fetch(KEY_PATH, { credentials: "omit" });
    return response.ok;
  } catch {
    return false;
  }
}
