/**
 * ============================================================
 * PERSISTENCE - Save/restore folder handles via IndexedDB
 * ============================================================
 * File System Access API handles can be serialized and stored
 * in IndexedDB so the user doesn't have to re-browse folders
 * during the same browser session (or across sessions if
 * the browser supports handle persistence).
 * ============================================================
 */

'use strict';

/**
 * Name of the IndexedDB database.
 * @const {string}
 */
const DB_NAME = 'PhotoWorkflowDB';

/**
 * IndexedDB version.
 * @const {number}
 */
const DB_VERSION = 1;

/**
 * Store name for folder handles.
 * @const {string}
 */
const STORE_NAME = 'folderHandles';

/**
 * Keys used to store each folder handle in the object store.
 * @type {Object<string, string>}
 */
const HANDLE_KEYS = {
  vb: 'folder_vb',
  raw: 'folder_raw',
  lens: 'folder_lens',
  geometry: 'folder_geometry',
  variantA: 'folder_variantA',
  output: 'folder_output'
};

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Create object store on first open or version upgrade
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(new Error('Cannot open IndexedDB: ' + event.target.error.message));
    };
  });
}

/**
 * Save a folder handle to IndexedDB.
 * @param {string} key     - One of HANDLE_KEYS values
 * @param {FileSystemDirectoryHandle} handle - Directory handle to save
 * @returns {Promise<void>}
 */
async function saveHandle(key, handle) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ id: key, handle: handle });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = (event) => {
        db.close();
        reject(new Error('Save handle error: ' + event.target.error.message));
      };
    });
  } catch (err) {
    console.warn('Could not save handle to IndexedDB:', err.message);
    // Non-critical: if IndexedDB is unavailable, we just don't persist
  }
}

/**
 * Load a previously saved folder handle from IndexedDB.
 * @param {string} key - One of HANDLE_KEYS values
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function loadHandle(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = (event) => {
        db.close();
        const result = event.target.result;
        if (result && result.handle) {
          resolve(result.handle);
        } else {
          resolve(null);
        }
      };
      request.onerror = (event) => {
        db.close();
        reject(new Error('Load handle error: ' + event.target.error.message));
      };
    });
  } catch (err) {
    console.warn('Could not load handle from IndexedDB:', err.message);
    return null;
  }
}

/**
 * Remove a saved folder handle from IndexedDB.
 * @param {string} key - One of HANDLE_KEYS values
 * @returns {Promise<void>}
 */
async function removeHandle(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(key);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = (event) => {
        db.close();
        reject(new Error('Remove handle error: ' + event.target.error.message));
      };
    });
  } catch (err) {
    console.warn('Could not remove handle from IndexedDB:', err.message);
  }
}

/**
 * Load all previously saved folder handles at startup.
 * @returns {Promise<Object<string, FileSystemDirectoryHandle|null>>}
 *   Returns an object keyed by folder type (vb, raw, lens, etc.)
 */
async function loadAllHandles() {
  const handles = {};
  for (const [folderType, key] of Object.entries(HANDLE_KEYS)) {
    handles[folderType] = await loadHandle(key);
  }
  return handles;
}

/**
 * Save all currently active folder handles.
 * @param {Object<string, FileSystemDirectoryHandle|null>} handles
 *   Object keyed by folder type
 * @returns {Promise<void>}
 */
async function saveAllHandles(handles) {
  for (const [folderType, handle] of Object.entries(handles)) {
    if (handle) {
      const key = HANDLE_KEYS[folderType];
      if (key) {
        await saveHandle(key, handle);
      }
    }
  }
}

/**
 * Clear all saved folder handles from IndexedDB.
 * @returns {Promise<void>}
 */
async function clearAllHandles() {
  for (const key of Object.values(HANDLE_KEYS)) {
    await removeHandle(key);
  }
}

// Export functions to global scope for use by other modules
window.Persistence = {
  saveHandle,
  loadHandle,
  removeHandle,
  loadAllHandles,
  saveAllHandles,
  clearAllHandles,
  HANDLE_KEYS
};
