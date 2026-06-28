export class PushSubscriptionService {
  public async isPushSupported(): Promise<boolean> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }
    if (
      Notification.permission === "granted" ||
      Notification.permission === "denied"
    ) {
      return false;
    }
    try {
      const response = await fetch("/public-keys/0");
      return response.ok;
    } catch {
      return false;
    }
  }

  public async setupPushSubscription(
    userId: string,
    deviceId: string,
  ): Promise<void> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    // Check if backend supports push
    const response = await fetch("/public-keys/0");
    if (!response.ok) {
      return;
    }
    const vapidPublicKey = await response.text();

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
    });

    const subscriptionData = subscription.toJSON();
    const endpoint = subscriptionData.endpoint;
    const p256dh = subscriptionData.keys?.p256dh;
    const auth = subscriptionData.keys?.auth;

    await fetch(`/users/${userId}/devices/${deviceId}/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint, p256dh, auth }),
    });
  }

  private urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const pushSubscriptionService = new PushSubscriptionService();
