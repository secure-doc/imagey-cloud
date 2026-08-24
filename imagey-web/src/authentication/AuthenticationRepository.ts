import { ResponseError } from "./ResponseError";

export interface SharedKey {
  issuer: string;
  kid: string;
  sharedKey: string;
}

// The scalar half of a registration request - serialized as the single JSON "metadata" multipart
// part. Keys must match the server-side RegistrationMetadata record component names character for
// character (see cloud.imagey.domain.user.RegistrationMetadata / AbstractRecordConverter).
export interface RegistrationMetadata {
  email: string;
  deviceId: string;
  devicePublicKey: JsonWebKey;
  mainPublicKey: JsonWebKey;
  encryptedPrivateKey: string;
  settingsKey: SharedKey;
  documentList: { id: string; key: SharedKey };
  chatList: { id: string; key: SharedKey };
  profile: { id: string; key: SharedKey };
}

// The four opaque encrypted document blobs, sent as their own binary parts alongside "metadata".
export interface RegistrationContents {
  settings: ArrayBuffer;
  documentList: ArrayBuffer;
  chatList: ArrayBuffer;
  profile: ArrayBuffer;
}

export const authenticationRepository = {
  register: async (
    metadata: RegistrationMetadata,
    contents: RegistrationContents,
  ) => {
    const formData = new FormData();
    formData.append(
      "metadata",
      // The content type is mandatory - a plain Blob defaults to application/octet-stream, which
      // CXF routes to the wrong MessageBodyReader and registration fails.
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    formData.append(
      "settings",
      new Blob([contents.settings], { type: "application/octet-stream" }),
    );
    formData.append(
      "documentList",
      new Blob([contents.documentList], { type: "application/octet-stream" }),
    );
    formData.append(
      "chatList",
      new Blob([contents.chatList], { type: "application/octet-stream" }),
    );
    formData.append(
      "profile",
      new Blob([contents.profile], { type: "application/octet-stream" }),
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
