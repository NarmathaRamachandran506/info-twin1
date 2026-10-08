import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Bolt,
  Eye,
  Trash2,
  RotateCw,
  FolderOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  CloudUpload,
} from 'lucide-react';

export default function DocumentTable({
  documents,
  selectedDocId,
  onSelectDoc,
  onProcessDoc,
  onProcessAll,
  onDeleteDoc,
  onRefresh,
  isProcessingAll,
}) {
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  const getFormatIcon = (type) => {
    const t = type?.toUpperCase();
    if (t === 'PDF') return <FileText size={18} style={{ color: '#f87171' }} />;
    if (t === 'DOCX') return <FileCode size={18} style={{ color: '#60a5fa' }} />;
    if (t === 'XLSX') return <FileSpreadsheet size={18} style={{ color: '#34d399' }} />;
    return <FileText size={18} style={{ color: '#94a3b8' }} />;
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Processing':
        return (
          <span className="status-badge Processing">
            <Loader2 size={12} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            Processing
          </span>
        );
      case 'Completed':
        return (
          <span className="status-badge Completed">
            <CheckCircle2 size={12} />
            Completed
          </span>
        );
      case 'Failed':
        return (
          <span className="status-badge Failed">
            <AlertTriangle size={12} />
            Failed
          </span>
        );
      case 'Uploaded':
      default:
        return (
          <span className="status-badge Uploaded">
            <CloudUpload size={12} />
            Uploaded
          </span>
        );
    }
  };

  return (
    <div className="table-container-section">
      <div className="doc-section-controls">
        <div>
          <h3>Uploaded Repository</h3>
          <span className="section-subtitle">Persistent in SQLite database</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-icon" onClick={onRefresh} title="Refresh document list">
            <RotateCw size={16} />
          </button>
          <button
            className="btn btn-primary"
            onClick={onProcessAll}
            disabled={isProcessingAll || documents.length === 0}
            title="Ingest and extract claims from all pending documents"
          >
            {isProcessingAll ? <Loader2 size={16} className="spin" /> : <Bolt size={16} />}
            Process Documents
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Size</th>
              <th>Status</th>
              <th>Uploaded Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-box">
                    <div className="empty-box-icon">
                      <FolderOpen size={28} />
                    </div>
                    <p className="empty-box-title">No documents in repository</p>
                    <span className="empty-box-desc">
                      Drag and drop your PDF, DOCX, or XLSX files above to get started.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const isSelected = doc.id === selectedDocId;
                const isCompleted = doc.status === 'Completed';
                const isProcessing = doc.status === 'Processing';

                return (
                  <tr
                    key={doc.id}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => isCompleted && onSelectDoc(doc.id)}
                    style={{ cursor: isCompleted ? 'pointer' : 'default' }}
                  >
                    <td>
                      <div className="doc-title-cell" title={doc.filename}>
                        {getFormatIcon(doc.type)}
                        <span className="doc-title-text">{doc.filename}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`format-tag ${doc.type}`}>{doc.type}</span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {formatFileSize(doc.size)}
                      </span>
                    </td>
                    <td>{renderStatusBadge(doc.status)}</td>
                    <td>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {formatTimestamp(doc.upload_time)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                        {!isCompleted ? (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => onProcessDoc(doc.id)}
                            disabled={isProcessing}
                            title="Process and extract claims"
                          >
                            <Bolt size={14} />
                            Process
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => onSelectDoc(doc.id)}
                            title="View extracted claims and document sections"
                          >
                            <Eye size={14} />
                            View Results
                          </button>
                        )}
                        <button
                          className="btn-remove-staged"
                          onClick={() => onDeleteDoc(doc.id)}
                          title="Delete document"
                          style={{ padding: '6px' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
