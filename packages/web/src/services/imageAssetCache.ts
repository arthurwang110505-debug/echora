/**
 * The three cache operations upstream's `services/db.ts` exposes to its visualizer-asset helpers
 * (`getFromCache` / `saveToCache` / `removeFromCache`), over one IndexedDB store of Echora's own.
 *
 * Why this exists at all: upstream persists Tempera's canvas-image pool in the same whole-app
 * database as the local music library, themes, session and migrations. Echora has no such
 * database — nothing in it persists anything but `localStorage`, and importing a 277-line
 * `db.ts` plus its repositories to store user artwork would have dragged the library, the theme
 * registry and their migrations along with it. So the port keeps upstream's helper files
 * untouched and gives them this: the same signature, one store, blobs welcome.
 *
 * Shape of a record is upstream's: `{ key, data, timestamp }`. `data` is handed to
 * `structuredClone` by IndexedDB, so a `Blob` survives a round trip as a `Blob` (which is what
 * `visualizerImageAsset.getStoredVisualizerImageAsset` checks for).
 */

const DB_NAME = 'echora-image-assets';
const DB_VERSION = 1;
const STORE = 'cache';

let databasePromise: Promise<IDBDatabase> | null = null;

/** `indexedDB` is absent in Node, and blocked in some privacy modes: both must fail as clearly as
 *  a quota error, because every caller already treats a rejected pool operation as "nothing was
 *  saved" and reports it through the status channel. */
const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser exposes no IndexedDB, so the image pool cannot be stored.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const database = request.result;
      // A second tab holding an older version open would otherwise block every later upgrade.
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open.'));
    request.onblocked = () => reject(new Error('Another tab is holding the image store open.'));
  });
  // A failed open must not be cached as the permanent answer: the next attempt starts over.
  databasePromise.catch(() => { databasePromise = null; });
  return databasePromise;
};

const runRequest = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The image store rejected the request.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('The image store transaction was aborted.'));
  });
};

type CachedRecord<T> = { key: string; data: T; timestamp: number };

export const saveToCache = async (key: string, data: unknown): Promise<void> => {
  await runRequest('readwrite', store => store.put({ key, data, timestamp: Date.now() } satisfies CachedRecord<unknown>));
};

export const getFromCache = async <T>(key: string): Promise<T | null> => {
  const record = await runRequest<CachedRecord<T> | undefined>('readonly', store => store.get(key));
  return record ? record.data : null;
};

export const removeFromCache = async (key: string): Promise<void> => {
  await runRequest('readwrite', store => store.delete(key));
};

/**
 * Every record whose key starts with `prefix`, newest first. The pool does not need it today, but
 * it is the reason the record carries a timestamp at all, and leaving it out would make this file
 * a worse substitute than the thing it replaces if a future port wants the same sweep.
 */
export const getCacheEntriesByPrefix = async <T>(prefix: string): Promise<Array<{ key: string; data: T; timestamp: number }>> => {
  const records = await runRequest<CachedRecord<T>[]>('readonly', store => store.getAll());
  return records
    .filter(record => typeof record.key === 'string' && record.key.startsWith(prefix))
    .sort((left, right) => right.timestamp - left.timestamp)
    .map(record => ({ key: record.key, data: record.data, timestamp: record.timestamp }));
};
