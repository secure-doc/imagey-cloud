import { ResponseError } from "../authentication/ResponseError";

export interface RawPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushSubscriptionRepository = {
  // undefined when push is disabled server-side (404, ADR 0020 decision 1).
  loadVapidKey: async (): Promise<string | undefined> => {
    const response = await fetch("/users/push/vapid-public-key", {
      method: "GET",
      headers: { Accept: "text/plain" },
      credentials: "same-origin",
    });
    if (response.status === 404) {
      return undefined;
    }
    const resolved = await resolve(response);
    return resolved.text();
  },

  store: async (
    userId: string,
    deviceId: string,
    subscription: RawPushSubscription,
  ): Promise<void> => {
    const response = await fetch(
      `/users/${userId}/devices/${deviceId}/push-subscription`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        }),
      },
    );
    await resolve(response);
  },

  remove: async (userId: string, deviceId: string): Promise<void> => {
    const response = await fetch(
      `/users/${userId}/devices/${deviceId}/push-subscription`,
      {
        method: "DELETE",
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
