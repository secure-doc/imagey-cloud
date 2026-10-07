import { GuestSession } from "./GuestSessionStore";

// Gets a fresh guest session for `origin` (2b: mint an assertion at the home
// server, redeem it at `origin`). Throws if that is not possible.
export interface GuestTokenProvider {
  renew(origin: string): Promise<GuestSession>;
}

export class FederationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FederationUnavailableError";
  }
}

// Until F4/F5 exist: no guest session can be obtained.
export const unavailableGuestTokenProvider: GuestTokenProvider = {
  renew: () =>
    Promise.reject(
      new FederationUnavailableError("No guest token provider configured"),
    ),
};
