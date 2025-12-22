import { ResponseError } from "./ResponseError";

export const authenticationRepository = {
  findDevices: async (email: string): Promise<string[]> => {
    const response = await fetch("/users/" + email + "/devices", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const resolvedResponse = await resolve(response);
    return resolvedResponse.json();
  },
  loadPrivateKey: async (
    email: string,
    deviceId: string,
  ): Promise<{ kid: string; encryptingDeviceId: string; key: string }> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/private-keys/0",
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
  storePrivateKey: async (
    email: string,
    encryptingDeviceId: string,
    receivingDeviceId: string,
    key: JsonWebKey,
    token?: string,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + receivingDeviceId + "/private-keys/0",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        credentials: "same-origin",
        body: JSON.stringify({
          kid: "0",
          encryptingDeviceId,
          key: JSON.stringify(key),
        }),
      },
    );
    await resolve(response);
  },
  loadPublicKey: async (email: string): Promise<JsonWebKey> => {
    const response = await fetch("/users/" + email + "/public-keys/0", {
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
    email: string,
    deviceId: string,
  ): Promise<JsonWebKey> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/public-keys/0",
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
  storePublicDeviceKey: async (
    email: string,
    deviceId: string,
    key: JsonWebKey,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/public-keys/",
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
};

async function resolve(response: Response): Promise<Response> {
  return response.status >= 200 && response.status <= 300
    ? Promise.resolve(response)
    : response.status === 401
      ? Promise.reject(ResponseError.UNAUTHORIZED)
      : response.status === 403
        ? Promise.reject(ResponseError.FORBIDDEN)
        : response.status == 404
          ? Promise.reject(ResponseError.NOT_FOUND)
          : Promise.reject(ResponseError.UNKNOWN);
}
