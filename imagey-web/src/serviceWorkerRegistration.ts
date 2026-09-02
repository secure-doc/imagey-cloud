// Registers the service worker in production builds only. During `vite dev`
// (which the Playwright suite runs against) a service worker would interfere
// with hot module reloading and request interception, so it stays disabled.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("ServiceWorker registration failed: ", error);
    });
  });
}
