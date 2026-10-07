// Sends a request for a path below /users to one server. The local client talks to
// the own server with the session cookie, a remote one (RemoteApiClient) to another
// server with a guest token (ADR 0013 decisions 4 and 6).
export interface ApiClient {
  // `path` always starts with "/users/". Credentials are the client's business,
  // callers never set `credentials`.
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

export const localApiClient: ApiClient = {
  fetch: (path, init) => fetch(path, { ...init, credentials: "same-origin" }),
};
