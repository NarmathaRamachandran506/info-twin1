import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, FileSpreadsheet, FileCode, X, Check, ArrowUpRight } from 'lucide-react';

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx'];
const MAX_FILE_SIZE_MB = 25;

export default function UploadZone({ onUpload, isUploading }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return <FileText size={18} style={{ color: '#f87171' }} />;
    if (ext === 'docx') return <FileCode size={18} style={{ color: '#60a5fa' }} />;
    if (ext === 'xlsx') return <FileSpreadsheet size={18} style={{ color: '#34d399' }} />;
    return <FileText size={18} style={{ color: '#94a3b8' }} />;
  };

  const handleFiles = (files) => {
    const newStaged = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        alert(`Unsupported file format: "${file.name}". Only PDF, DOCX, and XLSX are allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the maximum limit of ${MAX_FILE_SIZE_MB}MB.`);
        continue;
      }
      // Avoid duplicate in staged list
      if (!stagedFiles.some((f) => f.name === file.name && f.size === file.size)) {
        newStaged.push(file);
      }
    }
    setStagedFiles((prev) => [...prev, ...newStaged]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveStaged = (index) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTriggerUpload = async () => {
    if (stagedFiles.length === 0) return;
    const success = await onUpload(stagedFiles);
    if (success) {
      setStagedFiles([]);
    }
  };

  return (
    <div className="upload-container">
      <div
        className={`dropzone ${isDragOver ? 'active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept=".pdf,.docx,.xlsx"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="dropzone-icon-circle">
          <UploadCloud size={28} />
        </div>

        <h3 className="dropzone-title">Drag &amp; drop your documents here</h3>
        <p className="dropzone-subtitle">
          or <span style={{ color: '#818cf8', textDecoration: 'underline' }}>browse files</span> from your computer
        </p>

        <div className="format-pills">
          <span className="format-pill pill-pdf">
            <FileText size={12} /> PDF (PyMuPDF)
          </span>
          <span className="format-pill pill-docx">
            <FileCode size={12} /> DOCX (python-docx)
          </span>
          <span className="format-pill pill-xlsx">
            <FileSpreadsheet size={12} /> XLSX (openpyxl)
          </span>
        </div>
      </div>

      {stagedFiles.length > 0 && (
        <div className="staging-box">
          <div className="staging-header">
            <span>Staged Documents ({stagedFiles.length})</span>
            <button
              className="btn btn-sm btn-secondary"
              style={{ padding: '2px 8px', fontSize: '0.72rem' }}
              onClick={() => setStagedFiles([])}
            >
              Clear All
            </button>
          </div>

          <div className="staged-items-list">
            {stagedFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="staged-item">
                <div className="staged-item-info">
                  {getFileIcon(file.name)}
                  <span className="staged-item-name">{file.name}</span>
                  <span className="staged-item-size">({formatFileSize(file.size)})</span>
                </div>
                <button
                  className="btn-remove-staged"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveStaged(idx);
                  }}
                  title="Remove from staging"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="staging-actions">
            <button
              className="btn btn-primary"
              onClick={handleTriggerUpload}
              disabled={isUploading}
            >
              <UploadCloud size={16} />
              {isUploading ? 'Uploading to Repository...' : `Upload ${stagedFiles.length} Document(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
