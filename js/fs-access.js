/**
 * ============================================================
 * FS-ACCESS - File System Access API wrapper module
 * ============================================================
 * Provides high-level operations for:
 *   - Browsing/selecting folders via showDirectoryPicker
 *   - Reading directory contents (filenames)
 *   - Reading file contents as ArrayBuffer (for copying)
 *   - Creating directories and writing files to output
 *   - Checking file existence by basename
 *
 * All functions assume the browser supports the File System
 * Access API (Chrome 86+, Edge 86+).
 * ============================================================
 */

'use strict';

/**
 * Namespace for file system operations.
 * @namespace FSAccess
 */
window.FSAccess = (() => {

  // ============================================================
  // PRIVATE STATE
  // ============================================================

  /**
   * Map of folder type -> FileSystemDirectoryHandle.
   * Populated via browseFolder().
   * @type {Object<string, FileSystemDirectoryHandle>}
   */
  const _folderHandles = {};

  /**
   * Cache of directory entries for each folder (to avoid re-reading).
   * @type {Object<string, Array<{name: string, kind: string}>>}
   */
  const _directoryCache = {};

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  /**
   * Prompt the user to select a directory via the native file picker.
   * Stores the handle internally and returns directory info.
   * @param {string} folderType - Key identifying this folder (e.g. 'vb', 'raw')
   * @returns {Promise<{name: string, entries: Array}>}
   * @throws {Error} If user cancels or API is unavailable
   */
  async function browseFolder(folderType) {
    // Verify the File System Access API is available
    if (!window.showDirectoryPicker) {
      throw new Error(
        'File System Access API is not supported in this browser. ' +
        'Please use Chrome or Edge version 86 or later.'
      );
    }

    // Show the native directory picker
    const handle = await window.showDirectoryPicker();

    // Verify we have read/write permission by requesting it
    const options = { mode: 'readwrite' };
    try {
      await handle.requestPermission(options);
    } catch (permErr) {
      // If permission request fails, try read-only
      console.warn('Read-write permission denied, trying read-only:', permErr.message);
      await handle.requestPermission({ mode: 'read' });
    }

    // Store the handle
    _folderHandles[folderType] = handle;

    // Read and cache directory contents
    const entries = await listDirectoryEntries(handle);
    _directoryCache[folderType] = entries;

    // Return info about this folder
    return {
      name: handle.name,
      entries: entries
    };
  }

  /**
   * Get the stored handle for a folder type.
   * @param {string} folderType
   * @returns {FileSystemDirectoryHandle|null}
   */
  function getHandle(folderType) {
    return _folderHandles[folderType] || null;
  }

  /**
   * Set a handle programmatically (e.g., restored from IndexedDB).
   * Also reads the directory contents.
   * @param {string} folderType
   * @param {FileSystemDirectoryHandle} handle
   * @returns {Promise<{name: string, entries: Array}>}
   */
  async function setHandle(folderType, handle) {
    _folderHandles[folderType] = handle;
    const entries = await listDirectoryEntries(handle);
    _directoryCache[folderType] = entries;
    return { name: handle.name, entries };
  }

  /**
   * Get cached directory entries for a folder.
   * Returns null if folder hasn't been browsed yet.
   * @param {string} folderType
   * @returns {Array<{name: string, kind: string}>|null}
   */
  function getCachedEntries(folderType) {
    return _directoryCache[folderType] || null;
  }

  /**
   * Refresh the cached directory entries for a folder.
   * Useful after new files might have been added externally.
   * @param {string} folderType
   * @returns {Promise<Array<{name: string, kind: string}>>}
   */
  async function refreshCache(folderType) {
    const handle = _folderHandles[folderType];
    if (!handle) return [];
    const entries = await listDirectoryEntries(handle);
    _directoryCache[folderType] = entries;
    return entries;
  }

  /**
   * Get the folder name from a stored handle.
   * @param {string} folderType
   * @returns {string|null}
   */
  function getFolderName(folderType) {
    const handle = _folderHandles[folderType];
    return handle ? handle.name : null;
  }

  /**
   * Check if a file exists in a folder by basename match.
   * @param {string} folderType - e.g. 'vb', 'raw', 'lens'
   * @param {string} basename - e.g. 'img_0001'
   * @returns {{exists: boolean, filename: string|null}}
   */
  function fileExists(folderType, basename) {
    const entries = _directoryCache[folderType];
    if (!entries) return { exists: false, filename: null };

    const result = findFileByBasename(entries, basename);
    return {
      exists: result.found,
      filename: result.name
    };
  }

  /**
   * Find all files matching a basename in a folder (any extension).
   * @param {string} folderType
   * @param {string} basename
   * @returns {Array<{name: string}>}
   */
  function findAllFiles(folderType, basename) {
    const entries = _directoryCache[folderType];
    if (!entries) return [];
    return findAllByBasename(entries, basename);
  }

  /**
   * Get all filenames in a folder that start with a given prefix.
   * Case-insensitive.
   * @param {string} folderType
   * @param {string} prefix
   * @returns {Array<string>}
   */
  function findFilesByPrefix(folderType, prefix) {
    const entries = _directoryCache[folderType];
    if (!entries) return [];
    const lowerPrefix = prefix.toLowerCase();
    return entries
      .filter(e => e.kind === 'file' && e.name.toLowerCase().startsWith(lowerPrefix))
      .map(e => e.name);
  }

  /**
   * Compare the logical files in two folders.  A logical filename is its
   * basename, so IMG_0001 and IMG_0001.CR3 are treated as the same file.
   * Duplicate basenames are reported because they are ambiguous.
   */
  function compareFilesByBasename(firstFolder, secondFolder) {
    function indexFiles(folderType) {
      const index = new Map();
      for (const entry of (_directoryCache[folderType] || [])) {
        if (entry.kind !== 'file') continue;
        const key = getBasename(entry.name).toLowerCase();
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(entry.name);
      }
      return index;
    }

    const first = indexFiles(firstFolder);
    const second = indexFiles(secondFolder);
    const missingFromSecond = [...first.keys()].filter(key => !second.has(key));
    const missingFromFirst = [...second.keys()].filter(key => !first.has(key));
    const duplicates = [...first, ...second]
      .filter(([, files]) => files.length > 1)
      .map(([basename, files]) => ({ basename, files }));

    return {
      firstCount: first.size,
      secondCount: second.size,
      missingFromSecond,
      missingFromFirst,
      duplicates,
      matches: missingFromSecond.length === 0 && missingFromFirst.length === 0 && duplicates.length === 0
    };
  }

  /**
   * Lens Correction files must correspond one-to-one with RAW files using
   * the naming convention: RAW basename + "_LC" (extension is ignored).
   */
  function compareLensToRaw() {
    const rawEntries = (_directoryCache.raw || []).filter(entry => entry.kind === 'file');
    const lensEntries = (_directoryCache.lens || []).filter(entry => entry.kind === 'file');
    const rawNames = new Map();
    const lensNames = new Map();

    for (const entry of rawEntries) {
      const key = getBasename(entry.name).toLowerCase();
      if (!rawNames.has(key)) rawNames.set(key, []);
      rawNames.get(key).push(entry.name);
    }
    for (const entry of lensEntries) {
      const key = getBasename(entry.name).toLowerCase();
      if (!lensNames.has(key)) lensNames.set(key, []);
      lensNames.get(key).push(entry.name);
    }

    const expectedLensNames = new Set([...rawNames.keys()].map(name => `${name}_lc`));
    const missingFromLens = [...expectedLensNames].filter(name => !lensNames.has(name));
    const unexpectedInLens = [...lensNames.keys()].filter(name => !expectedLensNames.has(name));
    const duplicates = [...rawNames, ...lensNames]
      .filter(([, files]) => files.length > 1)
      .map(([basename, files]) => ({ basename, files }));

    return {
      rawCount: rawNames.size,
      lensCount: lensNames.size,
      missingFromLens,
      unexpectedInLens,
      duplicates,
      matches: missingFromLens.length === 0 && unexpectedInLens.length === 0 && duplicates.length === 0
    };
  }

  /**
   * Read a file from a folder as ArrayBuffer.
   * Used for copy operations.
   * @param {string} folderType
   * @param {string} filename - Exact filename (case-sensitive on some systems)
   * @returns {Promise<ArrayBuffer>}
   * @throws {Error} If file not found or cannot be read
   */
  async function readFile(folderType, filename) {
    const handle = _folderHandles[folderType];
    if (!handle) {
      throw new Error(`Folder "${folderType}" not selected.`);
    }

    // Get the file handle
    let fileHandle;
    try {
      fileHandle = await handle.getFileHandle(filename);
    } catch (err) {
      // Try case-insensitive search as fallback
      const entries = _directoryCache[folderType];
      const match = entries
        ? entries.find(e => e.kind === 'file' && e.name.toLowerCase() === filename.toLowerCase())
        : null;

      if (match) {
        fileHandle = await handle.getFileHandle(match.name);
      } else {
        throw new Error(`File not found: ${filename}`);
      }
    }

    // Read the file
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  /**
   * Write a file to the output folder using an ArrayBuffer.
   * @param {string} folderType - Should be 'output' typically
   * @param {string} filename - Name for the new file
   * @param {ArrayBuffer} data - File content
   * @returns {Promise<void>}
   * @throws {Error} If write fails
   */
  async function writeFile(folderType, filename, data) {
    const handle = _folderHandles[folderType];
    if (!handle) {
      throw new Error(`Output folder not selected.`);
    }

    // Create or get the file handle
    const fileHandle = await handle.getFileHandle(filename, { create: true });

    // Create a writable stream and write the data
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (err) {
      // Ensure writable is closed on error
      try { await writable.close(); } catch (_) { /* ignore */ }
      throw new Error(`Failed to write file "${filename}": ${err.message}`);
    }
  }

  /**
   * Delete a file from a folder (used in Move operations after copy).
   * @param {string} folderType
   * @param {string} filename
   * @returns {Promise<void>}
   */
  async function deleteFile(folderType, filename) {
    const handle = _folderHandles[folderType];
    if (!handle) {
      throw new Error(`Folder "${folderType}" not selected.`);
    }

    try {
      await handle.removeEntry(filename);
    } catch (err) {
      // If exact name fails, try case-insensitive match
      const entries = _directoryCache[folderType];
      const match = entries
        ? entries.find(e => e.kind === 'file' && e.name.toLowerCase() === filename.toLowerCase())
        : null;

      if (match) {
        await handle.removeEntry(match.name);
      } else {
        throw new Error(`Failed to delete file "${filename}": ${err.message}`);
      }
    }
  }

  /** Rename a file while preserving its contents and extension. */
  async function renameFile(folderType, oldFilename, newFilename) {
    const handle = _folderHandles[folderType];
    if (!handle) throw new Error(`Folder "${folderType}" not selected.`);
    if (oldFilename === newFilename) return;

    try {
      await handle.getFileHandle(newFilename);
      throw new Error(`"${newFilename}" already exists.`);
    } catch (err) {
      if (err.name !== 'NotFoundError') throw err;
    }

    const oldHandle = await handle.getFileHandle(oldFilename);
    const file = await oldHandle.getFile();
    const newHandle = await handle.getFileHandle(newFilename, { create: true });
    const writable = await newHandle.createWritable();
    try {
      await writable.write(file);
      await writable.close();
    } catch (err) {
      try { await writable.abort(); } catch (_) { /* ignore */ }
      throw new Error(`Could not create "${newFilename}": ${err.message}`);
    }
    await handle.removeEntry(oldFilename);
  }

  /**
   * Create a subdirectory inside the output folder.
   * @param {string} dirName - Name of the directory to create
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async function createOutputSubdir(dirName) {
    const handle = _folderHandles['output'];
    if (!handle) {
      throw new Error('Output folder not selected.');
    }
    return handle.getDirectoryHandle(dirName, { create: true });
  }

  /**
   * Check all folder handles are selected and valid.
   * @returns {Object<string, boolean>} Map of folder type -> selected status
   */
  function checkAllFolders() {
    const required = ['vb', 'raw', 'lens', 'geometry', 'variantA', 'output'];
    const status = {};
    for (const ft of required) {
      status[ft] = !!_folderHandles[ft];
    }
    return status;
  }

  /**
   * Check if all required folders have been selected.
   * @returns {boolean}
   */
  function allFoldersSelected() {
    const status = checkAllFolders();
    return Object.values(status).every(v => v === true);
  }

  /**
   * Clear all stored handles and cache (for testing or reset).
   */
  function resetAll() {
    for (const key of Object.keys(_folderHandles)) {
      delete _folderHandles[key];
    }
    for (const key of Object.keys(_directoryCache)) {
      delete _directoryCache[key];
    }
  }

  /**
   * Get a Map of folder type -> handle name for display.
   * @returns {Object<string, string>}
   */
  function getFolderNames() {
    const names = {};
    for (const [ft, handle] of Object.entries(_folderHandles)) {
      names[ft] = handle.name;
    }
    return names;
  }

  // ============================================================
  // EXPORT PUBLIC API
  // ============================================================

  return {
    browseFolder,
    getHandle,
    setHandle,
    getCachedEntries,
    refreshCache,
    getFolderName,
    fileExists,
    findAllFiles,
    findFilesByPrefix,
    compareFilesByBasename,
    compareLensToRaw,
    readFile,
    writeFile,
    deleteFile,
    renameFile,
    createOutputSubdir,
    checkAllFolders,
    allFoldersSelected,
    resetAll,
    getFolderNames
  };

})();
