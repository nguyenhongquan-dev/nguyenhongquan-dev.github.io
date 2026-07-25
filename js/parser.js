/**
 * ============================================================
 * PARSER - Parse Adobe Bridge paste list & detect VB per group
 * ============================================================
 * Handles:
 *   - Parsing the raw paste text from Adobe Bridge into groups
 *   - Stripping group numbers, empty lines, duplicate filenames
 *   - Extracting basenames (removing extensions)
 *   - Auto-detecting VB per group by cross-referencing
 *     the VB folder contents with each group's RAW list
 * ============================================================
 */

'use strict';

/**
 * Namespace for parsing operations.
 * @namespace Parser
 */
window.Parser = (() => {

  /**
   * Parse the raw paste text from Adobe Bridge into groups.
   *
   * Adobe Bridge list format for multiple groups:
   *   1
   *   img_0001.cr3
   *   img_0001.cr3
   *   img_0002.cr3
   *   img_0002.cr3
   *   img_0003.cr3
   *   img_0003.cr3
   *   (empty line)
   *   2
   *   img_0004.cr3
   *   img_0004.cr3
   *   img_0005.cr3
   *   img_0005.cr3
   *   img_0006.cr3
   *   img_0006.cr3
   *
   * Output:
   *   [
   *     ['img_0001', 'img_0002', 'img_0003'],
   *     ['img_0004', 'img_0005', 'img_0006']
   *   ]
   *
   * @param {string} rawText - The text pasted from Bridge
   * @returns {string[][]} Array of groups, each group is array of basenames
   */
  function parseGroups(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return [];
    }

    // Split into lines
    const lines = rawText.split(/\r?\n/);

    // Split into groups by digit-only lines (group markers)
    const groups = [];
    let currentGroup = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip completely empty lines
      if (trimmed === '') continue;

      // Check if this line is a group number marker (e.g. "1", "2", "17")
      if (/^\d+$/.test(trimmed)) {
        // Save current group if it has files
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        // Start new group
        currentGroup = [];
        continue;
      }

      // This is a filename line
      currentGroup.push(trimmed);
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // Process each group: deduplicate and extract basenames
    const result = groups.map(groupLines => {
      // Deduplicate while preserving order
      const seen = new Set();
      const unique = [];

      for (const line of groupLines) {
        const lower = line.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          unique.push(line);
        }
      }

      // Extract basenames (remove extensions)
      return unique.map(filename => getBasename(filename));
    });

    return result;
  }

  /**
   * Auto-detect VB for a specific group.
   * VB is the FIRST file in the group that also exists in the VB folder.
   *
   * @param {string[]} groupBasenames - Array of RAW basenames for one group
   * @returns {{ found: boolean, basename: string|null, error: string|null }}
   */
  function detectVBForGroup(groupBasenames) {
    // Get VB folder entries from FSAccess module
    const vbEntries = FSAccess.getCachedEntries('vb');

    // Check if VB folder was selected
    if (!vbEntries) {
      return {
        found: false,
        basename: null,
        error: 'VB folder is not selected.'
      };
    }

    // Convert VB folder entries to a Set of basenames (lowercase)
    const vbBasenames = new Set();
    for (const entry of vbEntries) {
      if (entry.kind === 'file') {
        const base = getBasename(entry.name).toLowerCase();
        vbBasenames.add(base);
      }
    }

    // Check if VB folder has any files
    if (vbBasenames.size === 0) {
      return {
        found: false,
        basename: null,
        error: 'VB folder is empty.'
      };
    }

    // Find the FIRST file in this group that exists in VB folder
    for (const rawBase of groupBasenames) {
      if (vbBasenames.has(rawBase.toLowerCase())) {
        return {
          found: true,
          basename: rawBase,
          error: null
        };
      }
    }

    // No match found in this group
    return {
      found: false,
      basename: null,
      error: `No VB found for group [${groupBasenames.join(', ')}]`
    };
  }

  /**
   * Validate the parsed groups.
   * @param {string[][]} groups
   * @returns {{ valid: boolean, message: string }}
   */
  function validateGroups(groups) {
    if (!groups || groups.length === 0) {
      return {
        valid: false,
        message: 'No valid groups found. Please paste a list from Adobe Bridge.'
      };
    }

    // Check each group has at least 1 file
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].length === 0) {
        return {
          valid: true,
          message: `Warning: Group ${i + 1} has no files.`
        };
      }
    }

    const totalFiles = groups.reduce((sum, g) => sum + g.length, 0);
    return {
      valid: true,
      message: `Parsed ${groups.length} group(s) with ${totalFiles} total files.`
    };
  }

  // ============================================================
  // EXPORT PUBLIC API
  // ============================================================

  return {
    parseGroups,
    detectVBForGroup,
    validateGroups
  };

})();
