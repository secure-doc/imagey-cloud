// A thin IndexedDB wrapper the page and the service worker both read/write
// (ADR 0020) - unlike `localStorage`, IndexedDB is reachable from a service
// worker. One record per device, keyed by `deviceId`, with a `byUser` index so
// a push (which only carries the recipient's userId) can find its record.
export interface NotificationDeviceRecord {
  userId: string;
  deviceId: string;
  // Mirror of imagey.devices[deviceId].recovery-key (localStorage) - written
  // together with it so the two never drift apart (see the recovery-key
  // desync incident).
  recoveryBlob?: string;
  // The device's own public key - saves the service worker a request.
  publicDeviceKey?: JsonWebKey;
  // The encrypted NotificationKeyring (see NotificationKeyring.ts).
  keyring?: string;
  // i18n.language as of the last write - used to localize a push shown by the
  // service worker, which has no React/i18next context of its own.
  language?: string;
  // The endpoint of the push subscription last stored on the server for this
  // device - compared with the browser's current one on startup to notice a
  // rotated subscription (PushSubscriptionService.reconcile).
  endpoint?: string;
}

const DB_NAME = "imagey-notifications";
const STORE = "devices";
const BY_USER_INDEX = "byUser";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "deviceId" });
        store.createIndex(BY_USER_INDEX, "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const notificationStore = {
  load: (deviceId: string): Promise<NotificationDeviceRecord | undefined> =>
    withStore("readonly", (store) => store.get(deviceId)),

  // The record for the account a push arrived for - a push only ever carries
  // the recipient's userId (ADR 0020 decision 3), never the deviceId.
  loadForUser: async (
    userId: string,
  ): Promise<NotificationDeviceRecord | undefined> => {
    const db = await openDb();
    try {
      return await new Promise<NotificationDeviceRecord | undefined>(
        (resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          const request = tx
            .objectStore(STORE)
            .index(BY_USER_INDEX)
            .get(userId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
    } finally {
      db.close();
    }
  },

  count: (): Promise<number> => withStore("readonly", (store) => store.count()),

  // Every stored device record - used to re-subscribe every account sharing
  // this browser's one push subscription on `pushsubscriptionchange`.
  list: (): Promise<NotificationDeviceRecord[]> =>
    withStore("readonly", (store) => store.getAll()),

  // Merges the patch into the existing record for this device, or creates one
  // if `partial` carries a `userId` (push being enabled for the first time).
  // Otherwise a no-op - lets callers that merely mirror data (e.g. a rotated
  // recovery blob) patch unconditionally without caring whether push happens
  // to be active on this device.
  patch: async (
    deviceId: string,
    partial: Partial<NotificationDeviceRecord>,
  ): Promise<void> => {
    const existing = await notificationStore.load(deviceId);
    const userId = partial.userId ?? existing?.userId;
    if (!userId) {
      return;
    }
    const merged: NotificationDeviceRecord = {
      ...existing,
      ...partial,
      userId,
      deviceId,
    };
    await withStore("readwrite", (store) => store.put(merged));
  },

  remove: (deviceId: string): Promise<undefined> =>
    withStore("readwrite", (store) => store.delete(deviceId)),
};
