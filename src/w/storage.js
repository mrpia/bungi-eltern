// Where a delegate's dataset lives between visits.
//
// IndexedDB rather than localStorage, for one reason that matters and one that will:
// it stores the project object as an object, so an autosave costs no string-building on
// the main thread while somebody is typing; and its quota is not a small fixed budget the
// six outputs would eventually run into.
//
// One record per class. A delegate with two children in two classes holds two, and both
// are theirs alone — nothing here is shared with anything or synchronised anywhere.
//
// Trap worth knowing before it bites: `file://` is a different origin than the hosted
// page, so the offline single-file build reads a *different* database. Two datasets, one
// tool, and no warning unless the page gives one. The page does; see workbench.js.

const DB_NAME = 'klassenkontakte';        // the product name, a proper noun
const DB_VERSION = 1;
const STORE = 'projects';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);                                  // private browsing in some browsers
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'slug' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('another tab holds an older version open'));
  });
  return dbPromise;
}

/**
 * Is there storage at all?
 *
 * A browser in a locked-down private mode can refuse IndexedDB outright. The honest
 * answer then is not a crash and not a silent failure: it is to say so, keep working in
 * memory, and tell the delegate to download the project file before closing the tab.
 *
 * @returns {Promise<{ok: true} | {ok: false, code: string, text: string}>}
 */
export async function ready() {
  try {
    await open();
    return { ok: true };
  } catch {
    dbPromise = null;
    return {
      ok: false,
      code: 'no-storage',
      text: 'Dieser Browser speichert hier nichts — vermutlich ein privates Fenster. '
        + 'Die Angaben bleiben nur, solange diese Seite offen ist: bitte die Projektdatei '
        + 'herunterladen, bevor Sie das Fenster schliessen.',
    };
  }
}

function inStore(mode, run) {
  return open().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let value;
    run(transaction.objectStore(STORE), (v) => { value = v; });
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
  }));
}

/** @returns {Promise<{slug, project, savedAt, openedAt}[]>} */
export const listRecords = () => inStore('readonly', (store, keep) => {
  const request = store.getAll();
  request.onsuccess = () => keep(request.result || []);
});

export const readRecord = (slug) => inStore('readonly', (store, keep) => {
  const request = store.get(slug);
  request.onsuccess = () => keep(request.result || null);
});

export const writeRecord = (slug, project, at) => inStore('readwrite', (store, keep) => {
  const request = store.get(slug);
  request.onsuccess = () => {
    const record = { ...(request.result || {}), slug, project, savedAt: at };
    store.put(record);
    keep(record);
  };
});

/**
 * Stamp a project as the one being worked on.
 *
 * This is how the page knows which class to reopen, instead of a separate "current
 * project" key that a delete could leave pointing at nothing.
 */
export const markOpened = (slug, at) => inStore('readwrite', (store, keep) => {
  const request = store.get(slug);
  request.onsuccess = () => {
    if (!request.result) { keep(null); return; }
    const record = { ...request.result, openedAt: at };
    store.put(record);
    keep(record);
  };
});

export const removeRecord = (slug) => inStore('readwrite', (store) => { store.delete(slug); });

/** Most recently opened first, so reopening the page lands where the delegate left off. */
export const byMostRecentlyOpened = (records) =>
  [...records].sort((a, b) =>
    String(b.openedAt || b.savedAt || '').localeCompare(String(a.openedAt || a.savedAt || '')));
