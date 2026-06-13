const CACHE_NAME = "imagey-cache-v1";
const DB_NAME = "ImageyShareStore";
const STORE_NAME = "sharedFiles";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeSharedFiles(files) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Clear old files before adding new ones
    store.clear();

    files.forEach((file) => store.add(file));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === "/upload") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll("images"); // 'images' from manifest.json

          if (files && files.length > 0) {
            await storeSharedFiles(files);
          }

          // Redirect to /images?shared=true
          return Response.redirect("/images?shared=true", 303);
        } catch (error) {
          console.error("Share Target error:", error);
          return Response.redirect("/images?error=share_failed", 303);
        }
      })(),
    );
  }
});
