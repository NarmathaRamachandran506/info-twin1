import React from 'react';
import { BrainCircuit, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Header({ isOnline, onLoadSamples, isLoadingSamples }) {
  return (
    <header className="app-header">
      <div className="brand-group">
        <div className="brand-icon-box">
          <BrainCircuit size={26} />
        </div>
        <div>
          <h1 className="brand-title">
            Intelligent Information Understanding &amp; Processing
            <span className="version-pill">React + Vite</span>
          </h1>
          <p className="brand-subtitle">
            Transform scattered documents into structured, actionable information.
          </p>
        </div>
      </div>

      <div className="header-actions">
        <div className="status-pill" title="Backend API Health">
          <span className="status-dot" style={{ backgroundColor: isOnline ? '#10b981' : '#ef4444' }} />
          <span>{isOnline ? 'System Online' : 'Connecting to API...'}</span>
        </div>

        <button
          className="btn btn-secondary"
          onClick={onLoadSamples}
          disabled={isLoadingSamples}
          title="Quickly load sample PDF, DOCX, and XLSX files"
        >
          <Sparkles size={16} />
          {isLoadingSamples ? 'Loading Samples...' : 'Test with Sample Files'}
        </button>
      </div>
    </header>
  );
}
