import { localApiClient } from "../api/ApiClient";
import { parseOrigin } from "../api/RemoteApiClient";
import { UserId } from "../authentication/UserId";
import { Email } from "../contexts/AuthenticationContext";
import { HttpError } from "../document/DocumentRepository";

export interface RedeemedSession {
  token: string;
  userId: string; // own UserId on the redeeming server (ForeignUserMapping)
  expiresIn: number; // seconds
}

// The two steps of getting into a foreign server (ADR 0013 decision 2) deliberately
// run against DIFFERENT servers, so these are plain functions and no repository over
// one ApiClient.
export const federationRepository = {
  // Own server, cookie session: a short-lived signed statement that the logged-in user
  // owns `email`, addressed to the server `aud` ("host[:port]") alone.
  mintAssertion: async (
    userId: UserId,
    aud: string,
    email: Email,
  ): Promise<string> => {
    const response = await localApiClient.fetch(
      `/users/${userId}/federation-assertions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ aud, email }),
      },
    );
    if (!response.ok) {
      throw new HttpError(response.status);
    }
    return (await response.json()).assertion;
  },

  // Own server, cookie session: the id `address` at server `domain` ("host[:port]") has on this
  // server (A6), created if it has none yet - the UserId under which a foreign user is known
  // here, e.g. to share a document with them.
  registerForeignPrincipal: async (
    userId: UserId,
    domain: string,
    address: Email,
  ): Promise<UserId> => {
    const response = await localApiClient.fetch(
      `/users/${userId}/foreign-principals`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ domain, address }),
      },
    );
    if (!response.ok) {
      throw new HttpError(response.status);
    }
    return (await response.json()).userId;
  },

  // Foreign server, no credentials and no Authorization: the assertion is the
  // credential. The invitation token is sent on first contact only. Every refusal is
  // the same 401 (nothing to tell a caller more), 429 means "too fast".
  redeem: async (
    origin: string,
    assertion: string,
    invitationToken?: string,
  ): Promise<RedeemedSession> => {
    const response = await fetch(
      parseOrigin(origin) + "/users/federation/sessions",
      {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(
          invitationToken ? { assertion, invitationToken } : { assertion },
        ),
      },
    );
    if (!response.ok) {
      throw new HttpError(response.status);
    }
    return response.json();
  },
};
