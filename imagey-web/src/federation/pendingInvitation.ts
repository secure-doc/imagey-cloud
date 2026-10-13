import { parseOrigin } from "../api/RemoteApiClient";

// A federated invitation that has to survive a login at this server (ADR 0013 A11): the login by
// mail link ends on "/?email=...", so neither path nor fragment make it. The token is a bearer
// secret - kept for an hour at most, and removed as soon as the invitation is dealt with.
const STORAGE_KEY = "imagey.pendingFederatedInvitation";
const MAX_AGE_MS = 60 * 60 * 1000;
export const ACCEPT_PATH = "/federation/accept";

export interface PendingFederatedInvitation {
  token: string;
  invitedBy: string;
  from: string; // origin of the inviting server
  savedAt: number;
}

export function clearPendingFederatedInvitation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; then nothing was stored either.
  }
}

// The stored invitation, unless it is too old (then it is dropped).
export function loadPendingFederatedInvitation(
  now: number = Date.now(),
): PendingFederatedInvitation | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      stored &&
      typeof stored.token === "string" &&
      typeof stored.invitedBy === "string" &&
      typeof stored.from === "string" &&
      typeof stored.savedAt === "number" &&
      now - stored.savedAt >= 0 &&
      now - stored.savedAt < MAX_AGE_MS
    ) {
      return stored;
    }
  } catch {
    // Unreadable: as good as none.
  }
  clearPendingFederatedInvitation();
  return undefined;
}

// Before the first render and independent of any login: takes an invitation off the URL
// (the inviting server's redirect puts it into the fragment) into storage and removes the
// fragment from the address bar.
export function capturePendingFederatedInvitation(
  location: Location = window.location,
  now: number = Date.now(),
): void {
  if (location.pathname !== ACCEPT_PATH) {
    return;
  }
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token");
  const invitedBy = params.get("invited-by");
  const from = params.get("from");
  if (!token || !invitedBy || !from) {
    return;
  }
  let origin: string;
  try {
    origin = parseOrigin(from);
  } catch {
    return;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, invitedBy, from: origin, savedAt: now }),
    );
  } catch {
    return; // Not stored: keep the fragment, the page cannot use it but nothing is lost.
  }
  history.replaceState(null, "", ACCEPT_PATH);
}
