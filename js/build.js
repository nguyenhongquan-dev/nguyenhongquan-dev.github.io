/**
 * ============================================================
 * BUILD - Workflow build engine (multi-group support)
 * ============================================================
 * Orchestrates the complete build process for multiple groups:
 *   - Each group gets its own folder (e.g. RED3-103/)
 *   - Creates output directory structure per group
 *   - Copies/Moves RAW files per group
 *   - Copies/Moves the Lens Correction counterpart for every RAW file
 *   - Copies/Moves Geometry file (VB only)
 *   - Copies/Moves Variant A file (VB only)
 *   - Copies/Moves Final Output file (VB from VB folder)
 *   - Reports progress via callbacks
 *   - Missing files are skipped, not blocked
 * ============================================================
 */

'use strict';

window.Builder = (() => {

  /** Subdirectory names inside each output folder */
  const SUBDIRS = {
    RAW: 'RAW',
    LC: 'Lens Correction',
    GEOMETRY: 'Geometry',
    VARIANT_A: 'Variant A',
    FINAL_OUTPUT: 'Final Output'
  };

  let _logCallback = null;
  let _progressCallback = null;
  let _aborted = false;

  function setLogCallback(cb) { _logCallback = cb; }
  function setProgressCallback(cb) { _progressCallback = cb; }
  function abort() { _aborted = true; }

  /**
   * Run the complete build for ALL groups.
   *
   * @param {Object} params
   * @param {Array<{folderName: string, vbBasename: string, rawBasenames: string[]}>} params.groups
   * @param {string} params.mode - 'copy' or 'move'
   * @returns {Promise<{success: boolean, errors: string[]}>}
   */
  async function build(params) {
    _aborted = false;
    const { groups, mode = 'copy' } = params;
    const allErrors = [];

    function log(msg, type) { if (_logCallback) _logCallback(msg, type || 'info'); }
    function setProgress(pct, label) { if (_progressCallback) _progressCallback(pct, label); }
    function isAborted() {
      if (_aborted) { log('⚠ Build cancelled by user.', 'warning'); return true; }
      return false;
    }

    async function getSubdirHandle(root, subdirName) {
      return root.getDirectoryHandle(subdirName, { create: true });
    }

    async function copyFileToDir(sourceFolder, destDir, filename) {
      try {
        const data = await FSAccess.readFile(sourceFolder, filename);
        const fileHandle = await destDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        log(`  ✅ Copied ${filename}`, 'success');
        if (mode === 'move') {
          try {
            await FSAccess.deleteFile(sourceFolder, filename);
            log(`  🗑 Deleted ${filename} from source`, 'info');
          } catch (delErr) {
            log(`  ⚠ Could not delete ${filename}: ${delErr.message}`, 'warning');
          }
        }
        return true;
      } catch (err) {
        allErrors.push(`Failed to copy ${filename}: ${err.message}`);
        log(`  ❌ Failed: ${filename} — ${err.message}`, 'error');
        return false;
      }
    }

    function findFile(folderType, basename) {
      const r = FSAccess.fileExists(folderType, basename);
      return r.exists ? r.filename : null;
    }

    const totalGroups = groups.length;
    let completedGroups = 0;

    for (const group of groups) {
      if (isAborted()) return { success: false, errors: allErrors };

      const { folderName, vbBasename, rawBasenames } = group;

      // --- Phase 1: Create directory structure ---
      log(`📁 Processing "${folderName}" (group ${completedGroups + 1}/${totalGroups})...`, 'progress');
      setProgress(Math.round((completedGroups / totalGroups) * 100), `Processing ${folderName}...`);

      let rootDir;
      try {
        rootDir = await FSAccess.createOutputSubdir(folderName);
        for (const subdir of Object.values(SUBDIRS)) {
          await rootDir.getDirectoryHandle(subdir, { create: true });
        }
      } catch (err) {
        allErrors.push(`Failed to create folder ${folderName}: ${err.message}`);
        completedGroups++;
        continue;
      }

      if (isAborted()) return { success: false, errors: allErrors };

      // --- Phase 2: Copy RAW files ---
      log('📄 Copying RAW files...', 'progress');
      let rawSubdir;
      try { rawSubdir = await getSubdirHandle(rootDir, SUBDIRS.RAW); } catch (e) {
        allErrors.push(`Cannot access RAW subdir: ${e.message}`); continue;
      }

      for (let i = 0; i < rawBasenames.length; i++) {
        if (isAborted()) return { success: false, errors: allErrors };
        const base = rawBasenames[i];
        const rawFile = findFile('raw', base);
        if (!rawFile) {
          // The pasted Bridge list can still contain photos deleted during
          // filtering. They are intentionally skipped, not build errors.
          log(`  ⏭ Skipped (removed from RAW): ${base}.*`, 'info');
          continue;
        }
        await copyFileToDir('raw', rawSubdir, rawFile);
        await delay(5);
      }

      // --- Phase 3: Lens Correction (one counterpart per RAW file) ---
      log('📄 Copying Lens Correction...', 'progress');
      const lcSubdir = await getSubdirHandle(rootDir, SUBDIRS.LC);
      for (const base of rawBasenames) {
        if (isAborted()) return { success: false, errors: allErrors };
        // Only a RAW file that remains after Bridge filtering needs an LC file.
        if (!findFile('raw', base)) continue;
        const lcFile = findFile('lens', `${base}_LC`);
        if (lcFile) {
          await copyFileToDir('lens', lcSubdir, lcFile);
        } else {
          allErrors.push(`Missing Lens Correction: ${base}_LC.*`);
          log(`  ❌ Missing: ${base}_LC.*`, 'error');
        }
      }
      await delay(5);
      if (isAborted()) return { success: false, errors: allErrors };

      // --- Phase 4: Geometry (VB only) ---
      log('📄 Copying Geometry...', 'progress');
      if (vbBasename) {
        const geomBase = `${vbBasename}_FVP`;
        const geomFile = findFile('geometry', geomBase);
        if (geomFile) {
          const subdir = await getSubdirHandle(rootDir, SUBDIRS.GEOMETRY);
          await copyFileToDir('geometry', subdir, geomFile);
        } else {
          log(`  ⏭ Skip: ${geomBase}.* not found`, 'info');
        }
      }
      await delay(5);
      if (isAborted()) return { success: false, errors: allErrors };

      // --- Phase 5: Variant A (VB only) ---
      log('📄 Copying Variant A...', 'progress');
      if (vbBasename) {
        const vaBase = `${vbBasename}_VA`;
        const vaFile = findFile('variantA', vaBase);
        if (vaFile) {
          const subdir = await getSubdirHandle(rootDir, SUBDIRS.VARIANT_A);
          await copyFileToDir('variantA', subdir, vaFile);
        } else {
          log(`  ⏭ Skip: ${vaBase}.* not found`, 'info');
        }
      }
      await delay(5);
      if (isAborted()) return { success: false, errors: allErrors };

      // --- Phase 6: Final Output (VB from VB folder) ---
      log('📄 Copying Final Output...', 'progress');
      if (vbBasename) {
        const vbFile = findFile('vb', vbBasename);
        if (vbFile) {
          const subdir = await getSubdirHandle(rootDir, SUBDIRS.FINAL_OUTPUT);
          await copyFileToDir('vb', subdir, vbFile);
        } else {
          log(`  ⏭ Skip: ${vbBasename}.* not found in VB folder`, 'info');
        }
      }
      await delay(5);

      completedGroups++;
      log(`✅ Done: "${folderName}"`, 'success');
    }

    // --- Finalize ---
    setProgress(100, 'Complete!');
    log(`🏁 Build complete! ${completedGroups}/${totalGroups} group(s) processed.`, 'success');
    if (allErrors.length > 0) {
      log(`⚠ ${allErrors.length} error(s) occurred:`, 'warning');
      for (const err of allErrors) log(`  • ${err}`, 'error');
    }
    return { success: allErrors.length === 0, errors: allErrors };
  }

  /**
   * Generate preview data for ALL groups.
   * @param {Array<{vbBasename: string, rawBasenames: string[]}>} groups
   * @returns {Array} Array of group preview objects
   */
  function generatePreview(groups) {
    return groups.map(group => {
      const { vbBasename, rawBasenames } = group;
      const p = {};

      p.raw = rawBasenames.map(base => {
        const found = FSAccess.fileExists('raw', base);
        return { basename: base, exists: found.exists, filename: found.filename };
      });

      p.lc = rawBasenames.map(base => {
        const lcBasename = `${base}_LC`;
        const found = FSAccess.fileExists('lens', lcBasename);
        return { basename: lcBasename, exists: found.exists, filename: found.filename };
      });

      p.geometry = null;
      if (vbBasename) {
        const base = `${vbBasename}_FVP`;
        const found = FSAccess.fileExists('geometry', base);
        p.geometry = { basename: base, exists: found.exists, filename: found.filename };
      }

      p.variantA = null;
      if (vbBasename) {
        const base = `${vbBasename}_VA`;
        const found = FSAccess.fileExists('variantA', base);
        p.variantA = { basename: base, exists: found.exists, filename: found.filename };
      }

      p.finalOutput = null;
      if (vbBasename) {
        const found = FSAccess.fileExists('vb', vbBasename);
        p.finalOutput = { basename: vbBasename, exists: found.exists, filename: found.filename };
      }

      // A name left in the pasted Bridge list may have been deleted during
      // filtering. It is skipped; only surviving RAW files require an LC file.
      p.missingFiles = [];
      for (let i = 0; i < p.raw.length; i++) {
        if (p.raw[i].exists && !p.lc[i].exists) {
          p.missingFiles.push(`${p.lc[i].basename}.* (Lens Correction)`);
        }
      }

      p.folderName = vbBasename ? vbBasename.toUpperCase() : 'UNKNOWN';
      p.vbBasename = vbBasename;
      p.rawBasenames = rawBasenames;
      return p;
    });
  }

  return { setLogCallback, setProgressCallback, abort, build, generatePreview, SUBDIRS };
})();
