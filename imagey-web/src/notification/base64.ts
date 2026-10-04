// Web Push's applicationServerKey must be raw bytes, not base64 - the VAPID
// public key travels as URL-safe base64 without padding (RFC 8292). Kept
// dependency-free (no `window`, no `localStorage`) so both the page
// (PushSubscriptionService) and the service worker (sw.ts) can use it.
export function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
