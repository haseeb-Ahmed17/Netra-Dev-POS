// IndexedDB persistence layer for reliable offline POS operation (Phase 11).
// Gracefully falls back when running in non-browser Node/test environments.

const DB_NAME = 'khaas_pos_offline_db';
const DB_VERSION = 1;
const STORE_KV = 'kv_store';

function hasIndexedDb(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGetItem<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) {
    try {
      const raw = globalThis.localStorage?.getItem(`idb_fallback_${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const store = tx.objectStore(STORE_KV);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve((req.result as T | undefined) ?? null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function idbSetItem<T>(key: string, value: T): Promise<boolean> {
  const db = await openDatabase();
  if (!db) {
    try {
      globalThis.localStorage?.setItem(`idb_fallback_${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      store.put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function idbRemoveItem(key: string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    try {
      globalThis.localStorage?.removeItem(`idb_fallback_${key}`);
    } catch {
      // ignore
    }
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export function isIndexedDbAvailable(): boolean {
  return hasIndexedDb();
}
