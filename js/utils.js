/**
 * ============================================================
 * UTILS - Shared utility functions
 * ============================================================
 * Provides helper functions used across modules:
 *   - Toast notification system
 *   - Logging to the build log area
 *   - String manipulation (basename, extension)
 *   - Async helpers
 * ============================================================
 */

'use strict';

/**
 * Show a Bootstrap toast notification.
 * @param {string} title   - Toast header title
 * @param {string} message - Toast body message
 * @param {string} [type]  - Optional: 'success' | 'error' | 'warning' | 'info'
 */
function showToast(title, message, type) {
  const toastEl = document.getElementById('mainToast');
  if (!toastEl) return;

  // Set title and message
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent = message;

  // Remove previous type classes
  toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-white');

  // Apply type styling
  switch (type) {
    case 'success':
      toastEl.classList.add('bg-success', 'text-white');
      break;
    case 'error':
      toastEl.classList.add('bg-danger', 'text-white');
      break;
    case 'warning':
      toastEl.classList.add('bg-warning');
      break;
    case 'info':
      toastEl.classList.add('bg-info');
      break;
    default:
      // Default dark header from Bootstrap
      break;
  }

  // Show the toast
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl);
  toast.show();
}

/**
 * Get the basename (filename without extension) from a full filename.
 * @param {string} filename - e.g. "img_0001.cr3" or "img_0001.png"
 * @returns {string} e.g. "img_0001"
 */
function getBasename(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return filename;
  return filename.substring(0, dotIndex);
}

/**
 * Get the file extension (including dot) from a filename.
 * @param {string} filename - e.g. "img_0001.cr3"
 * @returns {string} e.g. ".cr3"
 */
function getExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filename.substring(dotIndex).toLowerCase();
}

/**
 * Check if a filename matches a basename (case-insensitive).
 * Strips extension from filename first, then compares.
 * @param {string} filename - Full filename e.g. "IMG_0001.PNG"
 * @param {string} base     - Basename e.g. "img_0001"
 * @returns {boolean}
 */
function isBasenameMatch(filename, base) {
  if (!filename || !base) return false;
  const fileBase = getBasename(filename).toLowerCase();
  return fileBase === base.toLowerCase();
}

/**
 * Escape HTML special characters for safe rendering.
 * @param {string} text - Raw text
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

/**
 * Format a file size in bytes to human-readable string.
 * @param {number} bytes - Size in bytes
 * @returns {string} e.g. "1.5 MB"
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${size} ${units[i]}`;
}

/**
 * Format a Date to local date-time string.
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Delay execution for a given number of milliseconds.
 * Useful for yielding to UI updates.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if the File System Access API is supported.
 * @returns {boolean}
 */
function isFileSystemAccessSupported() {
  return 'showDirectoryPicker' in window ||
         'showOpenFilePicker' in window;
}

/**
 * Get the Files property from a FileSystemDirectoryHandle or iterate over its values.
 * This is a polyfill-friendly way to list directory contents.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<{name: string, kind: string}[]>}
 */
async function listDirectoryEntries(dirHandle) {
  const entries = [];
  try {
    for await (const entry of dirHandle.values()) {
      entries.push({
        name: entry.name,
        kind: entry.kind // 'file' or 'directory'
      });
    }
  } catch (err) {
    console.error('Error listing directory:', err);
    throw new Error(`Cannot read directory: ${err.message}`);
  }
  return entries;
}

/**
 * Find a file in an array of directory entries by basename (any extension).
 * @param {Array<{name: string, kind: string}>} entries - Directory entries
 * @param {string} basename - Target basename (without extension)
 * @returns {{name: string, found: boolean}}
 */
function findFileByBasename(entries, basename) {
  const match = entries.find(entry => {
    if (entry.kind !== 'file') return false;
    return isBasenameMatch(entry.name, basename);
  });
  return {
    name: match ? match.name : null,
    found: !!match
  };
}

/**
 * Find all files matching a basename in directory entries.
 * @param {Array<{name: string, kind: string}>} entries
 * @param {string} basename
 * @returns {Array<{name: string}>}
 */
function findAllByBasename(entries, basename) {
  return entries.filter(entry => {
    if (entry.kind !== 'file') return false;
    return isBasenameMatch(entry.name, basename);
  });
}
