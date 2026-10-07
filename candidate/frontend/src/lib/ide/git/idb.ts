/**
 * A tiny binary-safe key/value store on IndexedDB, used for everything under
 * `.git`.
 *
 * The workspace VFS is `Record<string, string>` — text only — but git objects
 * are zlib-compressed binary. Round-tripping them through a JS string would
 * corrupt them (and fill the Explorer with unreadable blobs), so the object
 * store lives here instead, where `Uint8Array` survives intact.
 */

const SCRATCH_DB = "mindfries-ide-git";
const DB_VERSION = 1;

// Each assessment session has its own repository, like its own saved
// workspace (fs-persist.ts) — otherwise the commits made in one assessment
// are the history the next one opens with. A workspace with no session keeps
// the original database.
let dbName = SCRATCH_DB;

/** Points git's storage at one session's repository. Call before any git use, when the workspace opens. */
export function setGitScope(sessionId?: string): void {
  const next = sessionId ? `${SCRATCH_DB}:${sessionId}` : SCRATCH_DB;
  if (next === dbName) return;
  dbName = next;
  dbPromise = null;
}
const STORE = "entries";

export type GitEntry = { type: "dir" } | { type: "file"; data: Uint8Array };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
      })
  );
}

export function idbGet(key: string): Promise<GitEntry | undefined> {
  return run("readonly", (store) => store.get(key) as IDBRequest<GitEntry | undefined>);
}

export function idbPut(key: string, entry: GitEntry): Promise<void> {
  return run("readwrite", (store) => store.put(entry, key) as IDBRequest<IDBValidKey>).then(() => undefined);
}

export function idbDelete(key: string): Promise<void> {
  return run("readwrite", (store) => store.delete(key) as IDBRequest<undefined>);
}

export function idbKeys(): Promise<string[]> {
  return run("readonly", (store) => store.getAllKeys() as IDBRequest<IDBValidKey[]>).then((keys) =>
    keys.map(String)
  );
}

/** Wipes the whole git store — used when the workspace is reset. */
export function idbClear(): Promise<void> {
  return run("readwrite", (store) => store.clear() as IDBRequest<undefined>);
}

/** True when a repository has been initialized (anything is stored at all). */
export async function hasGitData(): Promise<boolean> {
  try {
    const keys = await idbKeys();
    return keys.length > 0;
  } catch {
    return false;
  }
}
