import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import StatsOverview from './components/StatsOverview';
import UploadZone from './components/UploadZone';
import DocumentTable from './components/DocumentTable';
import DocumentDetail from './components/DocumentDetail';
import Toast from './components/Toast';
import {
  fetchHealth,
  fetchDocuments,
  uploadDocuments,
  processDocument,
  processAllDocuments,
  deleteDocument,
  loadSampleBenchmarkDocuments,
} from './services/api';

export default function App() {
  const [isOnline, setIsOnline] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pollTimerRef = useRef(null);

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Synchronize documents from backend
  const refreshDocuments = async (notify = false) => {
    try {
      const data = await fetchDocuments();
      const docs = data.documents || [];
      setDocuments(docs);

      // Auto-select first completed if none selected
      if (!selectedDocId && docs.length > 0) {
        const firstCompleted = docs.find((d) => d.status === 'Completed');
        if (firstCompleted) setSelectedDocId(firstCompleted.id);
      }

      if (notify) addToast('Document repository synchronized with SQLite.', 'success');
      return docs;
    } catch (err) {
      addToast(`Failed to load documents: ${err.message}`, 'error');
      return [];
    }
  };

  // Initial load & health verification
  useEffect(() => {
    fetchHealth()
      .then(() => setIsOnline(true))
      .catch(() => setIsOnline(false));

    refreshDocuments();
  }, []);

  // Check if any document is processing, poll every 2s
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'Processing');
    if (hasProcessing && !pollTimerRef.current) {
      pollTimerRef.current = setInterval(() => {
        refreshDocuments();
      }, 2000);
    } else if (!hasProcessing && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [documents]);

  // Upload handler
  const handleUpload = async (files) => {
    setIsUploading(true);
    try {
      const res = await uploadDocuments(files);
      addToast(`Successfully uploaded ${res.uploaded_count} document(s).`, 'success');
      await refreshDocuments();
      return true;
    } catch (err) {
      addToast(`Upload failed: ${err.message}`, 'error');
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  // Process single document
  const handleProcessDoc = async (docId) => {
    const doc = documents.find((d) => d.id === docId);
    addToast(`Processing "${doc?.filename || 'document'}"... Extracting claims.`, 'info');

    // Optimistic UI update
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: 'Processing' } : d))
    );

    try {
      const res = await processDocument(docId);
      addToast(res.message, 'success');
      await refreshDocuments();
      setSelectedDocId(docId);
    } catch (err) {
      addToast(`Processing failed: ${err.message}`, 'error');
      await refreshDocuments();
    }
  };

  // Batch process documents
  const handleProcessAll = async () => {
    setIsProcessingAll(true);
    addToast('Batch processing all uploaded documents...', 'info');

    try {
      const res = await processAllDocuments();
      addToast(`Batch processing completed (${res.total_processed} processed).`, 'success');
      const updatedDocs = await refreshDocuments();
      const completed = updatedDocs.find((d) => d.status === 'Completed');
      if (completed) setSelectedDocId(completed.id);
    } catch (err) {
      addToast(`Batch process error: ${err.message}`, 'error');
    } finally {
      setIsProcessingAll(false);
    }
  };

  // Delete document
  const handleDeleteDoc = async (docId) => {
    const doc = documents.find((d) => d.id === docId);
    if (!window.confirm(`Delete "${doc?.filename || 'document'}" and its claims?`)) return;

    try {
      await deleteDocument(docId);
      addToast('Document and its claims removed from repository.', 'info');
      if (selectedDocId === docId) setSelectedDocId(null);
      await refreshDocuments();
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  // Load benchmark sample files
  const handleLoadSamples = async () => {
    setIsLoadingSamples(true);
    addToast('Loading sample benchmark documents (PDF, DOCX, XLSX)...', 'info');

    try {
      const res = await loadSampleBenchmarkDocuments();
      addToast(`Loaded ${res.loaded_count} benchmark documents!`, 'success');
      await refreshDocuments();
    } catch (err) {
      addToast(`Could not load sample files: ${err.message}`, 'error');
    } finally {
      setIsLoadingSamples(false);
    }
  };

  const selectedDocument = documents.find((d) => d.id === selectedDocId);

  return (
    <div className="app-container">
      {/* Ambient background glows */}
      <div className="ambient-glow glow-primary" />
      <div className="ambient-glow glow-cyan" />

      {/* Header */}
      <Header
        isOnline={isOnline}
        onLoadSamples={handleLoadSamples}
        isLoadingSamples={isLoadingSamples}
      />

      {/* Global Overview Stats */}
      <StatsOverview documents={documents} />

      {/* Main Workspace Layout */}
      <main className="dashboard-layout">
        {/* Left Column: Upload Hub & Document Table */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Ingestion &amp; Upload Hub</h2>
            <span className="version-pill">PDF, DOCX, XLSX up to 25MB</span>
          </div>

          <UploadZone onUpload={handleUpload} isUploading={isUploading} />

          <DocumentTable
            documents={documents}
            selectedDocId={selectedDocId}
            onSelectDoc={(id) => setSelectedDocId(id)}
            onProcessDoc={handleProcessDoc}
            onProcessAll={handleProcessAll}
            onDeleteDoc={handleDeleteDoc}
            onRefresh={() => refreshDocuments(true)}
            isProcessingAll={isProcessingAll}
          />
        </section>

        {/* Right Column: Intelligence & Claims Explorer */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Intelligence &amp; Claims Explorer</h2>
            {selectedDocument && (
              <span className="version-pill" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedDocument.filename}
              </span>
            )}
          </div>

          <DocumentDetail
            document={selectedDocument}
            onClose={() => setSelectedDocId(null)}
          />
        </section>
      </main>

      {/* Footer */}
      <footer style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        <span>CogniSense — Intelligent Information Understanding &amp; Processing</span>
        <span>React 18 • Vite • FastAPI • SQLite</span>
      </footer>

      {/* Floating Toast Notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
