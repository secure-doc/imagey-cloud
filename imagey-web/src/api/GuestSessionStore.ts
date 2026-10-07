export interface GuestSession {
  origin: string; // e.g. "https://imagey.cloud"
  token: string; // guest bearer token (ADR 0013 A4, 15 min)
  userId: string; // own UserId ON THAT SERVER (ForeignUserMapping, F4)
  expiresAt: number; // epoch ms, computed from expiresIn at receipt
}

// In memory only: a bearer token that JavaScript can read is the XSS risk ADR 0013
// limits with the short TTL. Persisting it would widen that window needlessly - after
// a reload the session is simply renewed.
const sessions = new Map<string, GuestSession>();
// Bumped by clear(): a renewal that started before it belongs to the previous user.
let generation = 0;

export const guestSessionStore = {
  get: (origin: string): GuestSession | undefined => sessions.get(origin),
  set: (session: GuestSession): void => {
    sessions.set(session.origin, session);
  },
  generation: (): number => generation,
  // All origins.
  clear: (): void => {
    generation++;
    sessions.clear();
  },
};
