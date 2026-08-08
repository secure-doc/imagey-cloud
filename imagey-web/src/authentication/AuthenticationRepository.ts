import { Email } from "../contexts/AuthenticationContext";
import { ResponseError } from "./ResponseError";
import { EncryptedSharedKey } from "./types";

export const authenticationRepository = {
  register: async (
    email: Email,
    deviceId: string,
    publicMainKey: JsonWebKey,
    encryptedPrivateMainKey: ArrayBuffer,
    publicDeviceKey: JsonWebKey,
    settingsSharedKey: EncryptedSharedKey,
    settingsDocument: ArrayBuffer,
    documentListId: string,
    documentListKey: EncryptedSharedKey,
    documentList: ArrayBuffer,
    chatListId: string,
    chatListKey: EncryptedSharedKey,
    chatList: ArrayBuffer,
    profileId: string,
    profileKey: EncryptedSharedKey,
    profile: ArrayBuffer,
  ) => {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("deviceId", deviceId);
    formData.append(
      "publicDeviceKey",
      new Blob([JSON.stringify(publicDeviceKey)], { type: "application/json" }),
    );
    formData.append(
      "publicMainKey",
      new Blob([JSON.stringify(publicMainKey)], { type: "application/json" }),
    );
    formData.append(
      "privateMainKey",
      new Blob([encryptedPrivateMainKey], { type: "application/octet-stream" }),
    );
    formData.append(
      "settingsKey",
      new Blob([JSON.stringify(settingsSharedKey)], {
        type: "application/json",
      }),
    );
    formData.append(
      "settings",
      new Blob([settingsDocument], { type: "application/octet-stream" }),
    );
    formData.append("documentListId", documentListId);
    formData.append(
      "documentListKey",
      new Blob([JSON.stringify(documentListKey)], { type: "application/json" }),
    );
    formData.append(
      "documentList",
      new Blob([documentList], { type: "application/octet-stream" }),
    );
    formData.append("chatListId", chatListId);
    formData.append(
      "chatListKey",
      new Blob([JSON.stringify(chatListKey)], { type: "application/json" }),
    );
    formData.append(
      "chatList",
      new Blob([chatList], { type: "application/octet-stream" }),
    );
    formData.append("profileId", profileId);
    formData.append(
      "profileKey",
      new Blob([JSON.stringify(profileKey)], { type: "application/json" }),
    );
    formData.append(
      "profile",
      new Blob([profile], { type: "application/octet-stream" }),
    );

    const response = await fetch(`/users`, {
      method: "POST",
      credentials: "same-origin",
      body: formData,
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
  startAuthentication: async (email: string): Promise<Response> => {
    const response = await fetch("/users/" + email + "/verifications/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    });
    return resolve(response);
  },
  requestChallenge: async (
    email: string,
    deviceId: string,
  ): Promise<{ nonce: string; ephemeralPublicKey: JsonWebKey }> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/challenges",
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
    email: string,
    deviceId: string,
    signature: string,
    trustedDevice: boolean,
  ): Promise<void> => {
    const query = trustedDevice ? "?trusted=true" : "";
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/authentications" + query,
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
  loadRecoveryKey: async (email: string, deviceId: string): Promise<string> => {
    const response = await fetch(
      `/users/${email}/devices/${deviceId}/recovery-key`,
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
    email: string,
    deviceId: string,
    recoveryKey: string,
  ): Promise<void> => {
    const response = await fetch(
      `/users/${email}/devices/${deviceId}/recovery-key`,
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
