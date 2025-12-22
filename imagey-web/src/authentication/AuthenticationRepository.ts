import { Email } from "../contexts/AuthenticationContext";
import { ResponseError } from "./ResponseError";

export const authenticationRepository = {
  register: async (
    email: Email,
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
        email: email,
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
  loadPrivateMainKey: async (
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
  storePrivateMainKey: async (
    email: string,
    encryptingDeviceId: string,
    receivingDeviceId: string,
    encryptedKey: string,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + receivingDeviceId + "/private-keys/",
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
  loadPublicMainKey: async (email: string): Promise<JsonWebKey> => {
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
    const json = resolvedResponse.json();
    return json;
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
