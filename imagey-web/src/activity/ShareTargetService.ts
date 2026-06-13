/* istanbul ignore file */
const DB_NAME = "ImageyShareStore";
const STORE_NAME = "sharedFiles";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    /* istanbul ignore next */
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    /* istanbul ignore next */
    request.onerror = () => reject(request.error);
  });
}

export const shareTargetService = {
  async getSharedFiles(): Promise<File[]> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };
        /* istanbul ignore next */
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      /* istanbul ignore next */
      console.error("Failed to read shared files", e);
      /* istanbul ignore next */
      return [];
    }
  },

  async clearSharedFiles(): Promise<void> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        /* istanbul ignore next */
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      /* istanbul ignore next */
      console.error("Failed to clear shared files", e);
    }
  },
};
