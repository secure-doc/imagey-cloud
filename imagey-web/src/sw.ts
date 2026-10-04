/// <reference lib="webworker" />
// The app-shell cache is unchanged from the old public/sw.js; this becomes a
// Vite build entry (vite.sw.config.ts) instead of a static public file so it
// can share CryptoService/NotificationStore with the page (ADR 0020). Built
// as a classic script, not a module worker: Firefox and older Safari versions
// do not reliably support module service workers yet.
import { handlePush, PushDeps } from "./notification/handlePush";
import { notificationStore } from "./notification/NotificationStore";
import { createTranslator } from "./notification/notificationTranslations";
import { pushSubscriptionRepository } from "./notification/PushSubscriptionRepository";
import { urlBase64ToUint8Array } from "./notification/base64";
import { initAppName } from "./utils/appName";

declare const self: ServiceWorkerGlobalScope;

const CACHE = "imagey-shell-v5";
// The manifest is deliberately not cached: Chrome must always see the current
// one so manifest changes reach already-installed clients.
const SHELL = [
  "/index.html",
  "/favicon.ico",
  "/image.svg",
  "/image192.png",
  "/image512.png",
  "/maskable-192.png",
  "/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigations: serve from the network, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match("/index.html")) ?? Response.error(),
      ),
    );
    return;
  }

  // Immutable build assets and shell files: cache-first.
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Everything else (API calls, encrypted payloads, ...): straight to network.
});

// Only windows the user can actually see count: a chat open in a background
// tab must still get its notification.
function visibleClientRoutes(): Promise<string[]> {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) =>
      clients
        .filter((client) => client.visibilityState === "visible")
        .map((client) => new URL(client.url).pathname),
    );
}

// WebKit revokes a subscription after too many silent pushes - unlike other
// browsers, it must always show a notification (ADR 0020 risk "Stille Pushes").
function isWebKit(): boolean {
  const ua = self.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua))
  );
}

function swDeps(): PushDeps {
  return {
    fetch: (...args: Parameters<typeof fetch>) => self.fetch(...args),
    store: notificationStore,
    showNotification: (title, options) =>
      self.registration.showNotification(title, options),
    visibleClientRoutes,
    isWebKit: isWebKit(),
    translate: createTranslator,
    defaultLanguage: self.navigator.language,
  };
}

// The worker is stopped and restarted by the browser all the time, and module
// state does not survive that: getAppName() (used for the generic fallback
// title) has to be repopulated once per worker lifetime, not just on install.
let appNameReady: Promise<void> | undefined;

self.addEventListener("push", (event) => {
  const payload = event.data?.json();
  appNameReady ??= initAppName();
  event.waitUntil(appNameReady.then(() => handlePush(payload, swDeps())));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route =
    (event.notification.data as { route?: string } | undefined)?.route ??
    "/chats";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).pathname === route && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(route);
      }),
  );
});

// The push service invalidated the browser's one subscription (shared by
// every account in this browser profile, ADR 0020 decision 3). The worker can
// only subscribe again: storing the new subscription needs a device-bound
// session (ADR 0018), which only a page can establish. Each account stores it
// the next time it is opened (PushSubscriptionService.reconcile).
async function resubscribe(): Promise<void> {
  const vapidKey = await pushSubscriptionRepository.loadVapidKey();
  if (!vapidKey) {
    return;
  }
  try {
    await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } catch (e) {
    console.warn("Failed to resubscribe to push", e);
  }
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribe());
});
