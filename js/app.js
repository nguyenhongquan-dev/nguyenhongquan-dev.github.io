/**
 * ============================================================
 * APP - Main application entry point & UI controller
 * Multi-group support: parse Bridge list into groups,
 * detect VB per group, preview all groups, build all groups.
 * ============================================================
 */

'use strict';

const AppState = {
  /** Array of groups: each group = { rawBasenames: [], vbBasename: null, vbFound: false } */
  groups: [],
  /** Overall build mode */
  buildMode: 'copy',
  /** Whether any VB was detected (enables Build button) */
  anyVbFound: false
};

let DOM = {};

function cacheDOM() {
  DOM = {
    browseButtons: document.querySelectorAll('.btn-browse'),
    folderPaths: {
      vb: document.getElementById('path-vb'),
      raw: document.getElementById('path-raw'),
      lens: document.getElementById('path-lens'),
      geometry: document.getElementById('path-geometry'),
      variantA: document.getElementById('path-variantA'),
      output: document.getElementById('path-output')
    },
    folderStatus: {
      vb: document.getElementById('status-vb'),
      raw: document.getElementById('status-raw'),
      lens: document.getElementById('status-lens'),
      geometry: document.getElementById('status-geometry'),
      variantA: document.getElementById('status-variantA'),
      output: document.getElementById('status-output')
    },
    bridgePasteArea: document.getElementById('bridgePasteArea'),
    btnParse: document.getElementById('btnParse'),
    btnClear: document.getElementById('btnClear'),
    btnAddAnhSang: document.getElementById('btnAddAnhSang'),
    btnRemoveAnhSang: document.getElementById('btnRemoveAnhSang'),
    renameStatus: document.getElementById('renameStatus'),
    parseResult: document.getElementById('parseResult'),
    parseCount: document.getElementById('parseCount'),
    parseGroupsDetail: document.getElementById('parseGroupsDetail'),
    vbDetection: document.getElementById('vbDetection'),
    vbResult: document.getElementById('vbResult'),
    previewStatus: document.getElementById('previewStatus'),
    previewSummary: document.getElementById('previewSummary'),
    previewTree: document.getElementById('previewTree'),
    previewErrors: document.getElementById('previewErrors'),
    errorList: document.getElementById('errorList'),
    pvGroupCount: document.getElementById('pvGroupCount'),
    pvRawCount: document.getElementById('pvRawCount'),
    pvLcCount: document.getElementById('pvLcCount'),
    pvOtherCount: document.getElementById('pvOtherCount'),
    btnBuild: document.getElementById('btnBuild'),
    buildDisabledReason: document.getElementById('buildDisabledReason'),
    progressWrapper: document.getElementById('progressWrapper'),
    progressLabel: document.getElementById('progressLabel'),
    progressBar: document.getElementById('progressBar'),
    logArea: document.getElementById('logArea'),
    modeCopy: document.getElementById('modeCopy'),
    modeMove: document.getElementById('modeMove'),
    confirmModal: document.getElementById('confirmModal'),
    confirmBuild: document.getElementById('confirmBuild'),
    confirmModalBody: document.getElementById('confirmModalBody')
  };
}

async function init() {
  console.log('🔧 Photo Workflow Builder initializing...');

  if (!isFileSystemAccessSupported()) {
    showToast('Browser Not Supported', 'Requires Chrome/Edge 86+ with File System Access API.', 'error');
    document.querySelectorAll('.btn-browse').forEach(btn => btn.disabled = true);
    document.getElementById('btnParse').disabled = true;
    return;
  }

  cacheDOM();
  await restoreFolderHandles();
  bindEvents();
  updateAllFolderStatus();
  updateRenameControls();
  updateBuildButton();
  console.log('✅ Photo Workflow Builder initialized.');
  showToast('Ready', 'Application loaded. Select folders, paste list, and parse.', 'info');
}

async function restoreFolderHandles() {
  try {
    const handles = await Persistence.loadAllHandles();
    let count = 0;
    for (const [ft, handle] of Object.entries(handles)) {
      if (handle) {
        try {
          await handle.requestPermission({ mode: 'read' });
          await FSAccess.setHandle(ft, handle);
          count++;
        } catch {
          await Persistence.removeHandle(Persistence.HANDLE_KEYS[ft]);
        }
      }
    }
    if (count > 0) {
      updateAllFolderPaths();
      updateAllFolderStatus();
      showToast('Restored', `Restored ${count} folder(s).`, 'info');
    }
  } catch (err) {
    console.warn('Restore error:', err.message);
  }
}

function bindEvents() {
  DOM.browseButtons.forEach(btn => {
    btn.addEventListener('click', () => handleBrowseFolder(btn.dataset.folder));
  });

  DOM.btnParse.addEventListener('click', handleParse);
  DOM.btnClear.addEventListener('click', handleClear);
  DOM.btnAddAnhSang.addEventListener('click', () => handleRawRename('add'));
  DOM.btnRemoveAnhSang.addEventListener('click', () => handleRawRename('remove'));

  document.getElementById('tab-preview')?.addEventListener('shown.bs.tab', () => {
    if (AppState.groups.length > 0) renderPreview();
  });

  DOM.btnBuild.addEventListener('click', handleBuildClick);
  DOM.modeCopy.addEventListener('change', () => AppState.buildMode = 'copy');
  DOM.modeMove.addEventListener('change', () => AppState.buildMode = 'move');

  DOM.confirmBuild.addEventListener('click', async () => {
    const modal = bootstrap.Modal.getInstance(DOM.confirmModal);
    if (modal) modal.hide();
    await startBuild();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      clearLog();
      showToast('Log cleared', 'Build log cleared.', 'info');
    }
  });
}

// ============================================================
// TAB 1 - Browse Folders
// ============================================================

async function handleBrowseFolder(folderType) {
  try {
    DOM.folderStatus[folderType].textContent = '⏳';
    DOM.folderStatus[folderType].className = 'status-icon';

    const info = await FSAccess.browseFolder(folderType);
    const handle = FSAccess.getHandle(folderType);
    if (handle) await Persistence.saveHandle(Persistence.HANDLE_KEYS[folderType], handle);

    updateFolderPathDisplay(folderType, info.name);
    updateFolderStatus(folderType, true);
    showToast('Folder Selected', `Selected "${info.name}".`, 'success');

    if (AppState.groups.length > 0) detectAndUpdateVB();
    updateRenameControls();
    updateBuildButton();
  } catch (err) {
    if (err.name === 'AbortError') return;
    showToast('Error', `Could not select ${folderType} folder: ${err.message}`, 'error');
    updateFolderStatus(folderType, false);
  }
}

// ============================================================
// TAB 2 - Parse List
// ============================================================

function handleParse() {
  const rawText = DOM.bridgePasteArea.value;
  if (!rawText || rawText.trim() === '') {
    showToast('Empty Input', 'Paste a list from Adobe Bridge first.', 'warning');
    return;
  }

  // Parse into groups
  const groups = Parser.parseGroups(rawText);
  const validation = Parser.validateGroups(groups);
  if (!validation.valid) {
    showToast('Parse Error', validation.message, 'error');
    DOM.parseResult.classList.add('d-none');
    return;
  }

  // Store groups
  AppState.groups = groups.map((group, idx) => ({
    rawBasenames: group,
    vbBasename: null,
    vbFound: false,
    vbError: null,
    index: idx + 1
  }));

  // Display
  displayParsedGroups(AppState.groups);
  DOM.parseCount.textContent = groups.reduce((s, g) => s + g.length, 0);
  DOM.parseResult.classList.remove('d-none');

  // Detect VB for all groups
  detectAndUpdateVB();

  showToast('Parse Complete', validation.message, 'success');
  updateBuildButton();
}

function handleClear() {
  DOM.bridgePasteArea.value = '';
  DOM.parseResult.classList.add('d-none');
  DOM.vbDetection.classList.add('d-none');
  AppState.groups = [];
  AppState.anyVbFound = false;

  DOM.previewSummary.classList.add('d-none');
  DOM.previewTree.classList.add('d-none');
  DOM.previewErrors.classList.add('d-none');
  DOM.previewStatus.textContent = 'Waiting...';
  DOM.previewStatus.className = 'badge bg-secondary';

  updateBuildButton();
  showToast('Cleared', 'All cleared.', 'info');
}

function displayParsedGroups(groups) {
  const html = groups.map((g, idx) =>
    `<div class="mb-2"><strong>Group ${idx + 1}</strong> (${g.rawBasenames.length} files): ${g.rawBasenames.map(b => `<span class="basename-badge">${escapeHtml(b)}</span>`).join(' ')}</div>`
  ).join('');
  DOM.parseGroupsDetail.innerHTML = html;
}

function detectAndUpdateVB() {
  let foundCount = 0;
  let errors = [];

  for (const group of AppState.groups) {
    const result = Parser.detectVBForGroup(group.rawBasenames);
    group.vbBasename = result.basename;
    group.vbFound = result.found;
    group.vbError = result.error;
    if (result.found) foundCount++;
    if (result.error) errors.push(`Group ${group.index}: ${result.error}`);
  }

  AppState.anyVbFound = foundCount > 0;

  // Show VB detection
  DOM.vbDetection.classList.remove('d-none');
  if (errors.length === 0) {
    const allVbs = AppState.groups.filter(g => g.vbFound).map(g => escapeHtml(g.vbBasename)).join(', ');
    DOM.vbResult.className = 'p-2 rounded vb-found';
    DOM.vbResult.innerHTML = `
      <span class="text-success">✅ VB detected for ${foundCount}/${AppState.groups.length} groups</span><br>
      <small class="text-muted">VBs: ${allVbs}</small>
    `;
  } else {
    DOM.vbResult.className = 'p-2 rounded vb-error';
    DOM.vbResult.innerHTML = `
      <span class="text-warning">⚠ ${foundCount}/${AppState.groups.length} groups have VB</span><br>
      <small>${errors.map(e => escapeHtml(e)).join('<br>')}</small>
    `;
  }
}

// ============================================================
// TAB 3 - Preview
// ============================================================

function renderPreview() {
  if (!FSAccess.allFoldersSelected()) {
    DOM.previewStatus.textContent = '⚠ Select all folders first';
    DOM.previewStatus.className = 'badge bg-warning';
    return;
  }

  if (AppState.groups.length === 0) {
    DOM.previewStatus.textContent = '⚠ Parse RAW list first';
    DOM.previewStatus.className = 'badge bg-warning';
    return;
  }

  // Build group data for preview
  const groupData = AppState.groups.map(g => ({
    vbBasename: g.vbFound ? g.vbBasename : null,
    rawBasenames: g.rawBasenames
  }));

  const previews = Builder.generatePreview(groupData);

  // Update summary counts
  DOM.previewSummary.classList.remove('d-none');
  DOM.pvGroupCount.textContent = previews.length;
  const totalRaw = previews.reduce((s, p) => s + p.raw.length, 0);
  DOM.pvRawCount.textContent = totalRaw;
  const totalLc = previews.reduce((sum, p) => sum + p.lc.filter(item => item.exists).length, 0);
  DOM.pvLcCount.textContent = totalLc;
  const totalOther = previews.filter(p => (p.geometry && p.geometry.exists) || (p.variantA && p.variantA.exists) || (p.finalOutput && p.finalOutput.exists)).length;
  DOM.pvOtherCount.textContent = totalOther;

  // Render tree
  renderPreviewTree(previews);

  // Check Lens Correction only for RAW files that remain after filtering.
  let allMissing = [];
  let missingCount = 0;
  for (const p of previews) {
    for (const m of p.missingFiles) {
      allMissing.push(m);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    DOM.previewErrors.classList.remove('d-none');
    DOM.errorList.innerHTML = allMissing.map(f => `<div>❌ ${escapeHtml(f)}</div>`).join('');
    DOM.previewStatus.textContent = `⚠ ${missingCount} missing Lens Correction file(s) — will be skipped`;
    DOM.previewStatus.className = 'badge bg-warning text-dark';
  } else {
    DOM.previewErrors.classList.add('d-none');
    DOM.previewStatus.textContent = '✅ Ready to build';
    DOM.previewStatus.className = 'badge bg-success';
  }

  updateBuildButton();
}

function renderPreviewTree(previews) {
  DOM.previewTree.classList.remove('d-none');
  let html = '';

  for (const p of previews) {
    const folderName = escapeHtml(p.folderName);
    html += `<div class="tree-folder mt-2">📁 ${folderName}/</div>`;

    // RAW
    html += `<div class="tree-section"><div class="tree-section-title">📄 RAW/</div>`;
    for (const item of p.raw) {
      const icon = item.exists ? '✅' : '⏭';
      const cls = item.exists ? 'found' : 'skipped';
      const label = item.exists ? escapeHtml(item.filename || item.basename + '.*') : `Skipped (removed in Bridge): ${escapeHtml(item.basename)}.*`;
      html += `<div class="tree-file ${cls}">${icon} ${label}</div>`;
    }
    html += `</div>`;

    // LC
    html += `<div class="tree-section"><div class="tree-section-title">📄 Lens Correction/</div>`;
    for (const item of p.lc) {
      const rawExists = p.raw.find(raw => raw.basename.toLowerCase() === item.basename.replace(/_LC$/i, '').toLowerCase())?.exists;
      const icon = item.exists ? '✅' : (rawExists ? '❌' : '⏭');
      const cls = item.exists ? 'found' : (rawExists ? 'missing' : 'skipped');
      const label = item.exists ? escapeHtml(item.filename || item.basename + '.*') : (rawExists ? `Missing: ${escapeHtml(item.basename)}.*` : `Skipped (RAW removed): ${escapeHtml(item.basename)}.*`);
      html += `<div class="tree-file ${cls}">${icon} ${label}</div>`;
    }
    html += `</div>`;

    // Geometry
    html += `<div class="tree-section"><div class="tree-section-title">📄 Geometry/</div>`;
    if (p.geometry) {
      const icon = p.geometry.exists ? '✅' : '⏭';
      const cls = p.geometry.exists ? 'found' : 'skipped';
      const label = p.geometry.exists ? escapeHtml(p.geometry.filename || p.geometry.basename + '.*') : `Skipped: ${escapeHtml(p.geometry.basename)}.* not found`;
      html += `<div class="tree-file ${cls}">${icon} ${label}</div>`;
    } else {
      html += `<div class="tree-file">⏭ No VB, skipped</div>`;
    }
    html += `</div>`;

    // Variant A
    html += `<div class="tree-section"><div class="tree-section-title">📄 Variant A/</div>`;
    if (p.variantA) {
      const icon = p.variantA.exists ? '✅' : '⏭';
      const cls = p.variantA.exists ? 'found' : 'skipped';
      const label = p.variantA.exists ? escapeHtml(p.variantA.filename || p.variantA.basename + '.*') : `Skipped: ${escapeHtml(p.variantA.basename)}.* not found`;
      html += `<div class="tree-file ${cls}">${icon} ${label}</div>`;
    } else {
      html += `<div class="tree-file">⏭ No VB, skipped</div>`;
    }
    html += `</div>`;

    // Final Output
    html += `<div class="tree-section"><div class="tree-section-title">📄 Final Output/</div>`;
    if (p.finalOutput) {
      const icon = p.finalOutput.exists ? '✅' : '⏭';
      const cls = p.finalOutput.exists ? 'found' : 'skipped';
      const label = p.finalOutput.exists ? escapeHtml(p.finalOutput.filename || p.finalOutput.basename + '.*') : `Skipped: ${escapeHtml(p.finalOutput.basename)}.* not found in VB folder`;
      html += `<div class="tree-file ${cls}">${icon} ${label}</div>`;
    } else {
      html += `<div class="tree-file">⏭ No VB, skipped</div>`;
    }
    html += `</div>`;
  }

  DOM.previewTree.innerHTML = html;
}

// ============================================================
// TAB 4 - Build
// ============================================================

function handleBuildClick() {
  const validation = validateBuildConditions();
  if (!validation.canBuild) {
    showToast('Cannot Build', validation.reason, 'warning');
    return;
  }

  const groupCount = AppState.groups.length;
  const vbCount = AppState.groups.filter(g => g.vbFound).length;

  DOM.confirmModalBody.innerHTML = `
    <p>Are you sure you want to start the build?</p>
    <table class="table table-sm table-dark mb-0">
      <tr><td><strong>Groups:</strong></td><td>${groupCount}</td></tr>
      <tr><td><strong>Groups with VB:</strong></td><td>${vbCount}</td></tr>
      <tr><td><strong>Mode:</strong></td><td>${AppState.buildMode === 'copy' ? '📄 Copy' : '✂️ Move'}</td></tr>
    </table>
    <p class="text-warning mt-2 mb-0 small">⚠ Files missing from a source folder will be skipped and logged. Existing files in the save folder may be overwritten.</p>
  `;

  const modal = new bootstrap.Modal(DOM.confirmModal);
  modal.show();
}

function validateBuildConditions() {
  if (!FSAccess.allFoldersSelected()) return { canBuild: false, reason: 'Not all folders selected.' };
  if (AppState.groups.length === 0) return { canBuild: false, reason: 'No RAW groups parsed. Paste and parse first.' };
  if (!AppState.anyVbFound) return { canBuild: false, reason: 'No VB detected in any group.' };
  return { canBuild: true, reason: '' };
}

// ============================================================
// RAW PREPARATION - mark/unmark RAW photos that match a VB name
// ============================================================

function updateRenameControls() {
  const ready = !!FSAccess.getHandle('vb') && !!FSAccess.getHandle('raw');
  DOM.btnAddAnhSang.disabled = !ready;
  DOM.btnRemoveAnhSang.disabled = !ready;
  DOM.renameStatus.textContent = ready
    ? 'Sẵn sàng: chỉ đổi tên phần trước đuôi file.'
    : 'Cần chọn VB Folder và RAW Folder trước.';
}

async function handleRawRename(action) {
  if (!FSAccess.getHandle('vb') || !FSAccess.getHandle('raw')) {
    showToast('Chưa đủ thư mục', 'Hãy chọn VB Folder và RAW Folder trước.', 'warning');
    return;
  }

  const button = action === 'add' ? DOM.btnAddAnhSang : DOM.btnRemoveAnhSang;
  button.disabled = true;
  DOM.renameStatus.textContent = 'Đang cập nhật tên ảnh...';
  try {
    const permission = await FSAccess.getHandle('raw').requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('Cần quyền đọc/ghi cho RAW Folder để đổi tên.');
    await FSAccess.refreshCache('vb');
    await FSAccess.refreshCache('raw');
    const vbNames = new Set(FSAccess.getCachedEntries('vb')
      .filter(entry => entry.kind === 'file')
      .map(entry => getBasename(entry.name).toLowerCase()));
    const rawFiles = FSAccess.getCachedEntries('raw').filter(entry => entry.kind === 'file');
    const renames = [];

    for (const entry of rawFiles) {
      const base = getBasename(entry.name);
      const ext = getExtension(entry.name);
      if (action === 'add') {
        if (vbNames.has(base.toLowerCase())) renames.push([entry.name, `${base}_ANHSANG${ext}`]);
      } else if (/_ANHSANG$/i.test(base)) {
        renames.push([entry.name, `${base.replace(/_ANHSANG$/i, '')}${ext}`]);
      }
    }

    let done = 0;
    const failed = [];
    for (const [oldName, newName] of renames) {
      try {
        await FSAccess.renameFile('raw', oldName, newName);
        done++;
      } catch (err) {
        failed.push(oldName);
      }
    }
    await FSAccess.refreshCache('raw');
    const verb = action === 'add' ? 'Đã thêm _ANHSANG cho' : 'Đã bỏ _ANHSANG khỏi';
    DOM.renameStatus.textContent = `${verb} ${done} file.${failed.length ? ` Không đổi được ${failed.length} file do trùng tên hoặc lỗi ghi.` : ''}`;
    showToast('Đổi tên RAW', DOM.renameStatus.textContent, failed.length ? 'warning' : 'success');
  } catch (err) {
    DOM.renameStatus.textContent = `Không thể đổi tên: ${err.message}`;
    showToast('Lỗi đổi tên', err.message, 'error');
  } finally {
    updateRenameControls();
  }
}

async function startBuild() {
  const validation = validateBuildConditions();
  if (!validation.canBuild) {
    showToast('Cannot Build', validation.reason, 'error');
    return;
  }

  DOM.btnBuild.disabled = true;
  DOM.progressWrapper.style.display = 'block';
  clearLog();

  Builder.setLogCallback((msg, type) => addLogLine(msg, type));
  Builder.setProgressCallback((pct, label) => {
    DOM.progressBar.style.width = `${pct}%`;
    DOM.progressBar.textContent = `${pct}%`;
    DOM.progressLabel.textContent = label || 'Working...';
  });

  try {
    const groupData = AppState.groups.map(g => ({
      folderName: g.vbFound ? g.vbBasename.toUpperCase() : g.rawBasenames[0].toUpperCase(),
      vbBasename: g.vbFound ? g.vbBasename : null,
      rawBasenames: g.rawBasenames
    }));

    const result = await Builder.build({
      groups: groupData,
      mode: AppState.buildMode
    });

    if (result.success) {
      showToast('Build Complete', `All ${AppState.groups.length} group(s) built!`, 'success');
    } else {
      showToast('Build Completed with Errors', `${result.errors.length} error(s). Check log.`, 'warning');
    }
  } catch (err) {
    console.error('Build failed:', err);
    addLogLine(`❌ Build failed: ${err.message}`, 'error');
    showToast('Build Failed', err.message, 'error');
  } finally {
    DOM.btnBuild.disabled = false;
  }
}

// ============================================================
// UI UPDATE HELPERS
// ============================================================

function updateFolderPathDisplay(folderType, pathName) {
  const el = DOM.folderPaths[folderType];
  if (el) { el.innerHTML = escapeHtml(pathName); el.classList.remove('text-secondary'); el.classList.add('text-light'); }
}

function updateFolderStatus(folderType, isValid) {
  const el = DOM.folderStatus[folderType];
  if (!el) return;
  el.textContent = isValid ? '✅' : '❌';
  el.className = `status-icon ${isValid ? 'valid' : 'invalid'}`;
}

function updateAllFolderPaths() {
  const names = FSAccess.getFolderNames();
  for (const [ft, name] of Object.entries(names)) updateFolderPathDisplay(ft, name);
}

function updateAllFolderStatus() {
  const status = FSAccess.checkAllFolders();
  for (const [ft, isSelected] of Object.entries(status)) updateFolderStatus(ft, isSelected);
}

function updateBuildButton() {
  if (!FSAccess.allFoldersSelected()) {
    DOM.btnBuild.disabled = true;
    DOM.buildDisabledReason.textContent = 'Select all 6 folders first.';
    return;
  }
  if (AppState.groups.length === 0) {
    DOM.btnBuild.disabled = true;
    DOM.buildDisabledReason.textContent = 'Parse RAW list first.';
    return;
  }
  if (!AppState.anyVbFound) {
    DOM.btnBuild.disabled = true;
    DOM.buildDisabledReason.textContent = 'No VB detected. Check VB folder.';
    return;
  }
  DOM.btnBuild.disabled = false;
  DOM.buildDisabledReason.textContent = 'Ready to build!';
}

function addLogLine(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = message;
  DOM.logArea.appendChild(line);
  DOM.logArea.scrollTop = DOM.logArea.scrollHeight;
}

function clearLog() { DOM.logArea.innerHTML = ''; }

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('Init error:', err);
    showToast('Init Error', err.message, 'error');
  });
});
