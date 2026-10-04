import { JsonWebKeyPair } from "../contexts/AuthenticationContext";
import { authenticationService } from "../authentication/AuthenticationService";
import { deviceRepository } from "../device/DeviceRepository";
import { notificationStore } from "./NotificationStore";
import { notificationKeyringService } from "./NotificationKeyringService";
import {
  pushSubscriptionRepository,
  RawPushSubscription,
} from "./PushSubscriptionRepository";
import { urlBase64ToUint8Array } from "./base64";

export type PushSupport =
  | "unsupported"
  | "needs-install"
  | "denied"
  | "default"
  | "granted";

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // Safari's own non-standard flag - not covered by the media query there.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscriptionOf(subscription: PushSubscription): RawPushSubscription {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Incomplete push subscription");
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

export const pushSubscriptionService = {
  support: (): PushSupport => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return "unsupported";
    }
    if (isIOS() && !isStandalone()) {
      return "needs-install";
    }
    if (Notification.permission === "denied") {
      return "denied";
    }
    if (Notification.permission === "granted") {
      return "granted";
    }
    return "default";
  },

  // The subscription belongs to this device only if there is also a store
  // record for it - the browser subscription may belong to a different
  // account sharing this profile (ADR 0020 decision 3).
  isEnabled: async (
    deviceId: string,
    serviceWorkerReady: Promise<ServiceWorkerRegistration> = navigator
      .serviceWorker.ready,
  ): Promise<boolean> => {
    const registration = await serviceWorkerReady.catch(() => undefined);
    const subscription = await registration?.pushManager
      .getSubscription()
      .catch(() => undefined);
    if (!subscription) {
      return false;
    }
    return (await notificationStore.load(deviceId)) != null;
  },

  enable: async (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
    serviceWorkerReady: Promise<ServiceWorkerRegistration> = navigator
      .serviceWorker.ready,
  ): Promise<void> => {
    const deviceId = deviceRepository.loadDeviceId(userId);
    if (!deviceId) {
      throw new Error("deviceId not found");
    }
    // Must run synchronously off the click that triggered this call (a user
    // gesture), especially on iOS.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted");
    }
    const vapidKey = await pushSubscriptionRepository.loadVapidKey();
    if (!vapidKey) {
      throw new Error("Push notifications are disabled on this server");
    }
    const registration = await serviceWorkerReady;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const stored = subscriptionOf(subscription);
    await authenticationService.withBoundSession(
      userId,
      deviceKeyPair.privateKey,
      () => pushSubscriptionRepository.store(userId, deviceId, stored),
    );
    await notificationStore.patch(deviceId, {
      userId,
      deviceId,
      endpoint: stored.endpoint,
    });
    // NotificationStore.loadForUser finds a push's record by account only, so
    // a record of an earlier registration of this account in this browser
    // (another deviceId) would make that lookup ambiguous.
    const stale = (await notificationStore.list()).filter(
      (record) => record.userId === userId && record.deviceId !== deviceId,
    );
    await Promise.all(
      stale.map((record) => notificationStore.remove(record.deviceId)),
    );
    // A no-op unless "keep me logged in" is also active (isActive) - it then
    // fills in recoveryBlob/publicDeviceKey/language for the first time.
    await notificationKeyringService.sync(userId, deviceKeyPair, (k) => k);
  },

  // Deletes the server-side subscription and this device's store record.
  // Only unsubscribes the shared browser subscription once no account uses it
  // any more (ADR 0020 decision 3/"Mehrere Accounts pro Browser"). Deleting
  // needs a device-bound session (ADR 0018), which is only possible with the
  // device key pair; without it (a wrong-user cleanup, where the device is not
  // unlocked) the server-side deletion is best-effort and a later 410 from the
  // push service removes the subscription anyway.
  disable: async (
    userId: string,
    deviceKeyPair: JsonWebKeyPair | undefined,
    serviceWorkerReady: Promise<ServiceWorkerRegistration> = navigator
      .serviceWorker.ready,
  ): Promise<void> => {
    const deviceId = deviceRepository.loadDeviceId(userId);
    if (!deviceId) {
      return;
    }
    const remove = () => pushSubscriptionRepository.remove(userId, deviceId);
    await (
      deviceKeyPair
        ? authenticationService.withBoundSession(
            userId,
            deviceKeyPair.privateKey,
            remove,
          )
        : remove()
    ).catch((e) => console.warn("Failed to remove push subscription", e));
    await notificationStore.remove(deviceId);
    if ((await notificationStore.count()) > 0) {
      return;
    }
    const registration = await serviceWorkerReady.catch(() => undefined);
    const subscription = await registration?.pushManager
      .getSubscription()
      .catch(() => undefined);
    await subscription?.unsubscribe();
  },

  // Makes sure the server knows the subscription this browser currently has.
  // The push service can rotate it at any time (`pushsubscriptionchange`); the
  // service worker can only subscribe again, but storing the new one needs a
  // device-bound session (ADR 0018), which only a page can establish. So this
  // runs when the app starts for an account that has push enabled.
  reconcile: async (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
    serviceWorkerReady: Promise<ServiceWorkerRegistration> = navigator
      .serviceWorker.ready,
  ): Promise<void> => {
    const deviceId = deviceRepository.loadDeviceId(userId);
    const record = deviceId
      ? await notificationStore.load(deviceId)
      : undefined;
    if (!deviceId || !record || Notification.permission !== "granted") {
      return;
    }
    const registration = await serviceWorkerReady.catch(() => undefined);
    if (!registration) {
      return;
    }
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const vapidKey = await pushSubscriptionRepository.loadVapidKey();
      if (!vapidKey) {
        return;
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const current = subscriptionOf(subscription);
    if (current.endpoint === record.endpoint) {
      return;
    }
    await authenticationService.withBoundSession(
      userId,
      deviceKeyPair.privateKey,
      () => pushSubscriptionRepository.store(userId, deviceId, current),
    );
    await notificationStore.patch(deviceId, { endpoint: current.endpoint });
  },

  urlBase64ToUint8Array,
};
