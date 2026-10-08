import { GuestSession, guestSessionStore } from "../api/GuestSessionStore";
import {
  FederationUnavailableError,
  GuestTokenProvider,
} from "../api/GuestTokenProvider";
import { parseOrigin } from "../api/RemoteApiClient";
import { UserId } from "../authentication/UserId";
import { Email } from "../contexts/AuthenticationContext";
import { federationRepository } from "./FederationRepository";

export interface FederationGuestTokenProvider extends GuestTokenProvider {
  // First contact with `origin` through an invitation (F7 calls this). The session is
  // stored, and `email` is remembered as the address this account uses at `origin`.
  redeemInvitation(
    origin: string,
    invitationToken: string,
    email: Email,
  ): Promise<GuestSession>;
  // The address this account uses at `origin` (F7/F8 set it from the ContactEntry).
  rememberAddress(origin: string, email: Email): void;
}

// Gets guest sessions by asking the own server for an assertion and redeeming it at
// the other one (ADR 0013 decision 2). `identity` is read on every call, so the
// provider never works with a stale user.
export function createFederationGuestTokenProvider(
  identity: () => { userId: UserId; email?: Email } | undefined,
  repository = federationRepository,
  now: () => number = Date.now,
  store = guestSessionStore,
): FederationGuestTokenProvider {
  // The mapping at the other server hangs on the address the invitation was redeemed
  // with, so renewing must use that one, also if the account has several. In memory
  // only until F7 stores it with the contact. Dropped together with the sessions
  // (store.clear on logout / user change).
  const addresses = new Map<string, Email>();
  let generation = store.generation();
  const remembered = (server: string): Email | undefined => {
    if (store.generation() !== generation) {
      generation = store.generation();
      addresses.clear();
    }
    return addresses.get(server);
  };

  const redeem = async (
    server: string,
    email: Email | undefined,
    invitationToken?: string,
  ): Promise<GuestSession> => {
    const me = identity();
    const address = email ?? me?.email;
    if (!me || !address) {
      throw new FederationUnavailableError(
        "No logged-in user or address for " + server,
      );
    }
    const assertion = await repository.mintAssertion(
      me.userId,
      new URL(server).host,
      address,
    );
    const session = await repository.redeem(server, assertion, invitationToken);
    return {
      origin: server,
      token: session.token,
      userId: session.userId,
      expiresAt: now() + session.expiresIn * 1000,
    };
  };

  return {
    renew: (origin) => {
      const server = parseOrigin(origin);
      return redeem(server, remembered(server));
    },
    redeemInvitation: async (origin, invitationToken, email) => {
      const server = parseOrigin(origin);
      const generationBefore = store.generation();
      const session = await redeem(server, email, invitationToken);
      // A logout while the request was running: the session belongs to the previous user.
      if (store.generation() === generationBefore) {
        remembered(server);
        addresses.set(server, email);
        store.set(session);
      }
      return session;
    },
    rememberAddress: (origin, email) => {
      const server = parseOrigin(origin);
      remembered(server);
      addresses.set(server, email);
    },
  };
}
