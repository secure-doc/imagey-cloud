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

const DB_NAME = "notifications";
// Removed by migrateLegacyDb; delete this constant (and the migration) later.
const LEGACY_DB_NAME = "imagey-notifications";
const STORE = "devices";
const BY_USER_INDEX = "byUser";
const DB_VERSION = 1;

// Opens the legacy database without creating it: if it did not exist, the
// upgrade is aborted so no empty database is left behind.
function openLegacyDb(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    let missing = false;
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        missing = true;
        request.transaction?.abort();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      missing ? resolve(undefined) : reject(request.error);
  });
}

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteLegacyDb(): Promise<void> {
  const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
  return Promise.race([
    resultOf(request).then(() => undefined),
    // Another context still has it open: the deletion completes once that
    // connection closes, but we must not wait for it. The next start retries.
    new Promise<void>((resolve) => {
      request.onblocked = () => {
        console.warn("Legacy notification database is still in use");
        resolve();
      };
    }),
  ]);
}

async function copyLegacyRecords(): Promise<void> {
  const legacy = await openLegacyDb();
  if (!legacy) {
    return;
  }
  let records: NotificationDeviceRecord[];
  try {
    records = await resultOf(
      legacy.transaction(STORE, "readonly").objectStore(STORE).getAll(),
    );
  } finally {
    legacy.close();
  }
  const db = await openNewDb();
  try {
    await Promise.all(
      records.map(
        (record) =>
          new Promise<void>((resolve, reject) => {
            const request = db
              .transaction(STORE, "readwrite")
              .objectStore(STORE)
              .add(record);
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
              // Already present (e.g. migrated by the other context): keep it.
              if (request.error?.name === "ConstraintError") {
                event.preventDefault();
                resolve();
              } else {
                reject(request.error);
              }
            };
          }),
      ),
    );
  } finally {
    db.close();
  }
}

// Moves the records of the legacy "imagey-notifications" database into
// "notifications", once per context (page or service worker). `add` rather
// than `put`, so a stale copy never overwrites a newer record that the other
// context already wrote. Errors are swallowed: the app rewrites the records on
// start anyway.
let migration: Promise<void> | undefined;
function migrateLegacyDb(): Promise<void> {
  migration ??= (async () => {
    try {
      await copyLegacyRecords();
      await deleteLegacyDb();
    } catch (error) {
      console.warn("Failed to migrate the legacy notification database", error);
    }
  })();
  return migration;
}

async function openDb(): Promise<IDBDatabase> {
  await migrateLegacyDb();
  return openNewDb();
}

function openNewDb(): Promise<IDBDatabase> {
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
