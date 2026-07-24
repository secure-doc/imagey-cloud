import { ResponseError } from "./ResponseError";

export const authenticationRepository = {
  register: async (
    userId: string,
    deviceId: string,
    publicMainKey: JsonWebKey,
    encryptedPrivateMainKey: string,
    publicDeviceKey: JsonWebKey,
  ) => {
    const response = await fetch("/users/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        userId: userId,
        deviceId,
        mainPublicKey: publicMainKey,
        devicePublicKey: publicDeviceKey,
        encryptedPrivateKey: encryptedPrivateMainKey,
      }),
    });

    return response.status >= 200 && response.status < 300
      ? Promise.resolve()
      : Promise.reject();
  },
  findDevices: async (userId: string): Promise<string[]> => {
    const response = await fetch("/users/" + userId + "/devices", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const resolvedResponse = await resolve(response);
    return resolvedResponse.json();
  },
  loadPrivateMainKey: async (
    userId: string,
    deviceId: string,
  ): Promise<{ kid: string; encryptingDeviceId: string; key: string }> => {
    const response = await fetch(
      "/users/" + userId + "/devices/" + deviceId + "/private-keys/0",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      },
    );
    const resolvedResponse = await resolve(response);
    return resolvedResponse.json();
  },
  storePrivateMainKey: async (
    userId: string,
    encryptingDeviceId: string,
    receivingDeviceId: string,
    encryptedKey: string,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + userId + "/devices/" + receivingDeviceId + "/private-keys/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          kid: "0",
          encryptingDeviceId,
          key: encryptedKey,
        }),
      },
    );
    await resolve(response);
  },
  loadPublicMainKey: async (userId: string): Promise<JsonWebKey> => {
    const response = await fetch("/users/" + userId + "/public-keys/0", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const resolvedResponse = await resolve(response);
    return resolvedResponse.json();
  },
  loadPublicDeviceKey: async (
    userId: string,
    deviceId: string,
  ): Promise<JsonWebKey> => {
    const response = await fetch(
      "/users/" + userId + "/devices/" + deviceId + "/public-keys/0",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      },
    );
    const resolvedResponse = await resolve(response);
    const json = resolvedResponse.json();
    return json;
  },
  storePublicDeviceKey: async (
    userId: string,
    deviceId: string,
    key: JsonWebKey,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + userId + "/devices/" + deviceId + "/public-keys/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(key),
      },
    );
    await resolve(response);
  },
  startAuthentication: async (email: string): Promise<Response> => {
    const response = await fetch("/verifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    });
    return resolve(response);
  },
  requestChallenge: async (
    userId: string,
    deviceId: string,
  ): Promise<{ nonce: string; ephemeralPublicKey: JsonWebKey }> => {
    const response = await fetch(
      "/users/" + userId + "/devices/" + deviceId + "/challenges",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
      },
    );
    const resolvedResponse = await resolve(response);
    return resolvedResponse.json();
  },
  authenticateWithChallenge: async (
    userId: string,
    deviceId: string,
    signature: string,
    trustedDevice: boolean,
  ): Promise<void> => {
    const query = trustedDevice ? "?trusted=true" : "";
    const response = await fetch(
      "/users/" + userId + "/devices/" + deviceId + "/authentications" + query,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signature }),
        credentials: "same-origin",
      },
    );
    await resolve(response);
  },
  loadRecoveryKey: async (
    userId: string,
    deviceId: string,
  ): Promise<string> => {
    const response = await fetch(
      `/users/${userId}/devices/${deviceId}/recovery-key`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      },
    );
    const resolvedResponse = await resolve(response);
    return resolvedResponse.json();
  },
  storeRecoveryKey: async (
    userId: string,
    deviceId: string,
    recoveryKey: string,
  ): Promise<void> => {
    const response = await fetch(
      `/users/${userId}/devices/${deviceId}/recovery-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recoveryKey),
        credentials: "same-origin",
      },
    );
    await resolve(response);
  },
};

async function resolve(response: Response): Promise<Response> {
  return response.status >= 200 && response.status <= 300
    ? Promise.resolve(response)
    : response.status === 401
      ? Promise.reject(ResponseError.UNAUTHORIZED)
      : response.status === 403
        ? Promise.reject(ResponseError.FORBIDDEN)
        : response.status === 404
          ? Promise.reject(ResponseError.NOT_FOUND)
          : response.status === 503
            ? Promise.reject(ResponseError.SERVICE_UNAVAILABLE)
            : Promise.reject(ResponseError.UNKNOWN);
}
