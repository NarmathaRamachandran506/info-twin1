/**
 * CogniSense Web Application Frontend
 * Handles document uploads (PDF, DOCX, XLSX), processing orchestration,
 * SQLite-backed status synchronization, and interactive claim exploration.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const uploadProgressOverlay = document.getElementById('uploadProgressOverlay');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const uploadProgressText = document.getElementById('uploadProgressText');
  const alertBox = document.getElementById('alertBox');

  const documentsTbody = document.getElementById('documentsTbody');
  const btnProcessAll = document.getElementById('btnProcessAll');
  const btnRefreshDocs = document.getElementById('btnRefreshDocs');
  const btnQuickSample = document.getElementById('btnQuickSample');
  const systemStatus = document.getElementById('systemStatus');

  // Stats Counters
  const statTotalDocs = document.getElementById('statTotalDocs');
  const statTotalSections = document.getElementById('statTotalSections');
  const statTotalClaims = document.getElementById('statTotalClaims');

  // Results Explorer Elements
  const noSelectionState = document.getElementById('noSelectionState');
  const resultsContainer = document.getElementById('resultsContainer');
  const activeDocBadge = document.getElementById('activeDocBadge');
  const activeDocName = document.getElementById('activeDocName');

  const resDocFilename = document.getElementById('resDocFilename');
  const resDocFormat = document.getElementById('resDocFormat');
  const resDocSections = document.getElementById('resDocSections');
  const resDocClaims = document.getElementById('resDocClaims');
  const resDocStatus = document.getElementById('resDocStatus');

  const tabClaims = document.getElementById('tabClaims');
  const tabSections = document.getElementById('tabSections');
  const tabContentClaims = document.getElementById('tabContentClaims');
  const tabContentSections = document.getElementById('tabContentSections');
  const claimsCountTab = document.getElementById('claimsCountTab');
  const sectionsCountTab = document.getElementById('sectionsCountTab');

  const claimSearchInput = document.getElementById('claimSearchInput');
  const filterClaimType = document.getElementById('filterClaimType');
  const filterConfidence = document.getElementById('filterConfidence');
  const confValDisplay = document.getElementById('confValDisplay');
  const claimsList = document.getElementById('claimsList');
  const sectionsList = document.getElementById('sectionsList');

  // State
  let documents = [];
  let selectedDocumentId = null;
  let currentClaims = [];
  let currentSections = [];
  let pollInterval = null;

  // Allowed configuration
  const MAX_FILE_SIZE_MB = 25;
  const ALLOWED_EXTS = ['pdf', 'docx', 'xlsx'];

  // --- Initialization ---
  initApp();

  async function initApp() {
    setupEventListeners();
    await checkHealth();
    await loadDocuments();
  }

  // --- Health Check ---
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        systemStatus.innerHTML = `
          <span class="status-pulse"></span>
          <span class="status-text">Engine Online (v1.0)</span>
        `;
      }
    } catch (err) {
      systemStatus.innerHTML = `
        <span class="status-pulse" style="background:#ef4444;box-shadow:0 0 8px #ef4444;"></span>
        <span class="status-text" style="color:#f87171;">Backend Disconnected</span>
      `;
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Dropzone Click & Input
    browseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.click();
    });
    dropZone.addEventListener('click', (e) => {
      if (e.target !== browseBtn) {
        fileInput.click();
      }
    });
    fileInput.addEventListener('change', handleFileSelect);

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        uploadFiles(files);
      }
    });

    // Control Buttons
    btnRefreshDocs.addEventListener('click', () => loadDocuments(true));
    btnProcessAll.addEventListener('click', processAllDocuments);
    btnQuickSample.addEventListener('click', loadSampleBenchmarkFiles);

    // Tabs
    tabClaims.addEventListener('click', () => switchTab('claims'));
    tabSections.addEventListener('click', () => switchTab('sections'));

    // Claims Filtering
    claimSearchInput.addEventListener('input', renderFilteredClaims);
    filterClaimType.addEventListener('change', renderFilteredClaims);
    filterConfidence.addEventListener('input', (e) => {
      confValDisplay.textContent = `${e.target.value}%`;
      renderFilteredClaims();
    });
  }

  // --- File Selection & Validation ---
  function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(files);
      fileInput.value = ''; // Reset input
    }
  }

  function validateFiles(files) {
    const validFiles = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop().toLowerCase();
      const sizeMB = file.size / (1024 * 1024);

      if (!ALLOWED_EXTS.includes(ext)) {
        errors.push(`"${file.name}": Unsupported format .${ext}. Only PDF, DOCX, and XLSX allowed.`);
        continue;
      }

      if (file.size === 0) {
        errors.push(`"${file.name}": File is empty (0 bytes).`);
        continue;
      }

      if (sizeMB > MAX_FILE_SIZE_MB) {
        errors.push(`"${file.name}": Size (${sizeMB.toFixed(1)}MB) exceeds maximum limit of ${MAX_FILE_SIZE_MB}MB.`);
        continue;
      }

      validFiles.push(file);
    }

    return { validFiles, errors };
  }

  // --- Upload Files ---
  async function uploadFiles(fileList) {
    const { validFiles, errors } = validateFiles(fileList);

    if (errors.length > 0) {
      showAlert(errors.join('<br>'), 'warning');
    }

    if (validFiles.length === 0) {
      return;
    }

    // Show Progress Overlay
    uploadProgressOverlay.classList.remove('hidden');
    uploadProgressBar.style.width = '20%';
    uploadProgressText.textContent = `Preparing ${validFiles.length} document(s)...`;

    const formData = new FormData();
    for (let i = 0; i < validFiles.length; i++) {
      formData.append('files', validFiles[i]);
    }

    try {
      uploadProgressBar.style.width = '60%';
      uploadProgressText.textContent = 'Uploading to server & validating cryptographic hash...';

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      uploadProgressBar.style.width = '90%';

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail?.errors ? errData.detail.errors.join('; ') : (errData.detail || 'Upload failed'));
      }

      const data = await res.json();
      uploadProgressBar.style.width = '100%';

      showAlert(`Successfully uploaded ${data.uploaded_count} document(s). Ready for processing.`, 'success');
      await loadDocuments();

    } catch (err) {
      showAlert(`Upload error: ${err.message}`, 'error');
    } finally {
      setTimeout(() => {
        uploadProgressOverlay.classList.add('hidden');
        uploadProgressBar.style.width = '0%';
      }, 500);
    }
  }

  // --- Load Benchmark Samples ---
  async function loadSampleBenchmarkFiles() {
    showAlert('Loading sample benchmark files (PDF, DOCX, XLSX)...', 'info');
    try {
      const res = await fetch('/api/documents/load-samples', { method: 'POST' });
      if (!res.ok) throw new Error('Could not load sample files');
      const data = await res.json();
      showAlert(`Loaded ${data.loaded_count} benchmark files successfully! Click "Process Documents" to ingest.`, 'success');
      await loadDocuments();
    } catch (err) {
      showAlert(`Failed to load sample files: ${err.message}`, 'error');
    }
  }

  // --- Load Documents from SQLite ---
  async function loadDocuments(showToast = false) {
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to fetch documents repository');

      const data = await res.json();
      documents = data.documents || [];
      renderDocumentsTable();
      updateDashboardStats();

      // Check if any document is currently Processing; if so, schedule polling
      const hasProcessing = documents.some(d => d.status === 'Processing');
      if (hasProcessing && !pollInterval) {
        pollInterval = setInterval(() => loadDocuments(false), 2000);
      } else if (!hasProcessing && pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      if (showToast) {
        showAlert('Documents synchronized from SQLite.', 'success');
      }

    } catch (err) {
      console.error(err);
      showAlert(`Failed to load documents: ${err.message}`, 'error');
    }
  }

  // --- Render Documents Table ---
  function renderDocumentsTable() {
    if (documents.length === 0) {
      documentsTbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">
            <div class="empty-state">
              <i class="fa-solid fa-folder-open empty-icon"></i>
              <p>No documents uploaded yet.</p>
              <span>Drag and drop a PDF, DOCX, or XLSX file above to get started.</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    documentsTbody.innerHTML = documents.map(doc => {
      const isSelected = doc.id === selectedDocumentId;
      const fileIcon = getFormatIcon(doc.type);
      const formattedSize = formatBytes(doc.size);
      const isProcessing = doc.status === 'Processing';
      const isCompleted = doc.status === 'Completed';

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-id="${doc.id}">
          <td>
            <div class="doc-name-cell" title="${escapeHtml(doc.filename)}">
              ${fileIcon}
              <span>${escapeHtml(doc.filename)}</span>
            </div>
          </td>
          <td>
            <span class="format-badge ${doc.type}">${doc.type}</span>
          </td>
          <td><span style="color:var(--text-muted);font-size:0.8rem;">${formattedSize}</span></td>
          <td>
            <span class="status-badge ${doc.status}">
              ${doc.status === 'Processing' ? '<i class="fa-solid fa-spinner fa-spin"></i>' : ''}
              ${doc.status === 'Completed' ? '<i class="fa-solid fa-circle-check"></i>' : ''}
              ${doc.status === 'Failed' ? '<i class="fa-solid fa-circle-exclamation"></i>' : ''}
              ${doc.status === 'Uploaded' ? '<i class="fa-solid fa-cloud"></i>' : ''}
              ${doc.status}
            </span>
          </td>
          <td><strong style="color:var(--text-main);">${doc.section_count || 0}</strong></td>
          <td><strong style="color:var(--accent-emerald);">${doc.claim_count || 0}</strong></td>
          <td>
            <div class="table-actions">
              ${!isCompleted ? `
                <button class="btn btn-sm btn-primary action-process" data-id="${doc.id}" ${isProcessing ? 'disabled' : ''} title="Ingest and extract claims">
                  <i class="fa-solid fa-bolt"></i> Process
                </button>
              ` : `
                <button class="btn btn-sm btn-secondary action-view" data-id="${doc.id}" title="Inspect extracted claims and sections">
                  <i class="fa-solid fa-eye"></i> View Results
                </button>
              `}
              <button class="btn btn-sm btn-danger-subtle action-delete" data-id="${doc.id}" title="Delete document">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row action listeners
    document.querySelectorAll('.action-process').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        processSingleDocument(btn.dataset.id);
      });
    });

    document.querySelectorAll('.action-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewDocumentResults(btn.dataset.id);
      });
    });

    document.querySelectorAll('.action-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDocument(btn.dataset.id);
      });
    });

    document.querySelectorAll('.documents-table tbody tr').forEach(row => {
      row.addEventListener('click', () => {
        const docId = row.dataset.id;
        if (docId) viewDocumentResults(docId);
      });
    });
  }

  // --- Process Single Document ---
  async function processSingleDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    showAlert(`Processing "${doc.filename}"... Extracting content & claims.`, 'info');
    
    // Immediate optimistic status update
    doc.status = 'Processing';
    renderDocumentsTable();

    try {
      const res = await fetch(`/api/documents/${docId}/process`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Processing failed');
      }

      showAlert(data.message, 'success');
      await loadDocuments();
      // Automatically open the results view for the processed document!
      await viewDocumentResults(docId);

    } catch (err) {
      showAlert(`Processing error for "${doc.filename}": ${err.message}`, 'error');
      await loadDocuments();
    }
  }

  // --- Batch Process All Uploaded Documents ---
  async function processAllDocuments() {
    const pending = documents.filter(d => d.status === 'Uploaded' || d.status === 'Failed');
    if (pending.length === 0) {
      showAlert('No pending documents to process.', 'info');
      return;
    }

    showAlert(`Processing ${pending.length} pending document(s)... Ingesting content & generating claims.`, 'info');
    btnProcessAll.disabled = true;
    btnProcessAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
      const res = await fetch('/api/documents/process-all', { method: 'POST' });
      const data = await res.json();

      showAlert(`Batch processing complete! Processed ${data.total_processed} document(s).`, 'success');
      await loadDocuments();

      // If at least one was processed, select the first completed one
      const completed = documents.find(d => d.status === 'Completed');
      if (completed) {
        await viewDocumentResults(completed.id);
      }

    } catch (err) {
      showAlert(`Batch processing failed: ${err.message}`, 'error');
    } finally {
      btnProcessAll.disabled = false;
      btnProcessAll.innerHTML = '<i class="fa-solid fa-bolt"></i> Process Documents';
    }
  }

  // --- Delete Document ---
  async function deleteDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!confirm(`Delete "${doc?.filename || 'document'}" and its extracted claims?`)) return;

    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');

      showAlert('Document and associated claims removed.', 'success');
      if (selectedDocumentId === docId) {
        selectedDocumentId = null;
        noSelectionState.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        activeDocBadge.classList.add('hidden');
      }
      await loadDocuments();
    } catch (err) {
      showAlert(`Delete error: ${err.message}`, 'error');
    }
  }

  // --- View Results for a Document ---
  async function viewDocumentResults(docId) {
    selectedDocumentId = docId;
    renderDocumentsTable(); // Update selected highlight

    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    // Show Results Panel Container
    noSelectionState.classList.add('hidden');
    resultsContainer.classList.remove('hidden');
    activeDocBadge.classList.remove('hidden');
    activeDocName.textContent = doc.filename;

    // Update Doc Metadata Summary
    resDocFilename.textContent = doc.filename;
    resDocFormat.textContent = doc.type;
    resDocSections.textContent = doc.section_count || 0;
    resDocClaims.textContent = doc.claim_count || 0;
    resDocStatus.className = `status-badge ${doc.status}`;
    resDocStatus.innerHTML = `${doc.status}`;

    // If document is failed, display failure banner
    if (doc.status === 'Failed') {
      claimsList.innerHTML = `
        <div class="alert-box error" style="margin: 20px 0;">
          <i class="fa-solid fa-circle-exclamation"></i>
          <div>
            <strong>Processing Failed:</strong>
            <p>${escapeHtml(doc.error || 'Unknown ingestion error occurred.')}</p>
          </div>
        </div>
      `;
      sectionsList.innerHTML = '<p style="color:var(--text-dim);padding:20px;">No sections extracted due to failure.</p>';
      claimsCountTab.textContent = '0';
      sectionsCountTab.textContent = '0';
      return;
    }

    // Fetch Claims & Sections
    try {
      const [claimsRes, sectionsRes] = await Promise.all([
        fetch(`/api/documents/${docId}/claims`),
        fetch(`/api/documents/${docId}/sections`)
      ]);

      if (claimsRes.ok) {
        const claimsData = await claimsRes.json();
        currentClaims = claimsData.claims || [];
        claimsCountTab.textContent = currentClaims.length;
        renderFilteredClaims();
      }

      if (sectionsRes.ok) {
        const sectionsData = await sectionsRes.json();
        currentSections = sectionsData.sections || [];
        sectionsCountTab.textContent = currentSections.length;
        renderSectionsList();
      }

    } catch (err) {
      showAlert(`Failed to load document claims: ${err.message}`, 'error');
    }
  }

  // --- Filter & Render Claims ---
  function renderFilteredClaims() {
    const query = claimSearchInput.value.toLowerCase().trim();
    const typeFilter = filterClaimType.value;
    const minConf = parseFloat(filterConfidence.value) / 100;

    const filtered = currentClaims.filter(c => {
      // Query filter
      const matchesQuery = !query || c.claim.toLowerCase().includes(query) || c.source.toLowerCase().includes(query);
      // Type filter
      const matchesType = typeFilter === 'All' || c.claim_type.toLowerCase() === typeFilter.toLowerCase();
      // Confidence filter
      const matchesConf = c.confidence >= minConf;
      return matchesQuery && matchesType && matchesConf;
    });

    if (filtered.length === 0) {
      claimsList.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <i class="fa-solid fa-filter-circle-xmark empty-icon"></i>
          <p>No claims match current filter criteria.</p>
          <span>Try adjusting your keyword search, claim type, or confidence slider.</span>
        </div>
      `;
      return;
    }

    claimsList.innerHTML = filtered.map(c => {
      const confPercent = Math.round(c.confidence * 100);
      return `
        <div class="claim-card">
          <div class="claim-card-top">
            <div class="claim-badges">
              <span class="claim-type-badge ${c.claim_type}">${c.claim_type}</span>
              <span class="claim-source-tag"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(c.source)}</span>
            </div>
            <div class="claim-confidence-meter" title="Confidence Score: ${(c.confidence * 100).toFixed(1)}%">
              <span>${confPercent}% Conf.</span>
              <div class="conf-bar">
                <div class="conf-fill" style="width: ${confPercent}%;"></div>
              </div>
            </div>
          </div>
          <div class="claim-text">
            ${escapeHtml(c.claim)}
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Render Sections List (Phase 2 Common Structure) ---
  function renderSectionsList() {
    if (currentSections.length === 0) {
      sectionsList.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <i class="fa-solid fa-file-lines empty-icon"></i>
          <p>No sections available.</p>
        </div>
      `;
      return;
    }

    sectionsList.innerHTML = currentSections.map((s, idx) => `
      <div class="section-card">
        <div class="section-meta">
          <span class="section-source-badge">${s.source}</span>
          <span class="section-location-text"><i class="fa-solid fa-bookmark"></i> ${escapeHtml(s.location)}</span>
        </div>
        <div class="section-body-text">${escapeHtml(s.text)}</div>
      </div>
    `).join('');
  }

  // --- Switch Tabs ---
  function switchTab(tabKey) {
    if (tabKey === 'claims') {
      tabClaims.classList.add('active');
      tabSections.classList.remove('active');
      tabContentClaims.classList.remove('hidden');
      tabContentSections.classList.add('hidden');
    } else {
      tabSections.classList.add('active');
      tabClaims.classList.remove('active');
      tabContentSections.classList.remove('hidden');
      tabContentClaims.classList.add('hidden');
    }
  }

  // --- Dashboard Stats Computation ---
  function updateDashboardStats() {
    statTotalDocs.textContent = documents.length;
    
    const totalSections = documents.reduce((sum, d) => sum + (d.section_count || 0), 0);
    statTotalSections.textContent = totalSections;

    const totalClaims = documents.reduce((sum, d) => sum + (d.claim_count || 0), 0);
    statTotalClaims.textContent = totalClaims;
  }

  // --- UI Notification Helper ---
  function showAlert(message, type = 'info') {
    alertBox.className = `alert-box ${type}`;
    alertBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
        <div>${message}</div>
      </div>
      <button style="background:none;border:none;color:inherit;cursor:pointer;" onclick="this.parentElement.classList.add('hidden')">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    alertBox.classList.remove('hidden');

    if (type === 'success') {
      setTimeout(() => alertBox.classList.add('hidden'), 5000);
    }
  }

  // --- Format Helpers ---
  function getFormatIcon(type) {
    switch (type?.toUpperCase()) {
      case 'PDF':
        return '<i class="fa-solid fa-file-pdf" style="color:#f87171;font-size:1.1rem;"></i>';
      case 'DOCX':
        return '<i class="fa-solid fa-file-word" style="color:#60a5fa;font-size:1.1rem;"></i>';
      case 'XLSX':
        return '<i class="fa-solid fa-file-excel" style="color:#34d399;font-size:1.1rem;"></i>';
      default:
        return '<i class="fa-solid fa-file-lines" style="color:#94a3b8;font-size:1.1rem;"></i>';
    }
  }

  function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
