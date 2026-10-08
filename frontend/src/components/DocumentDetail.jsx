import React, { useState, useEffect } from 'react';
import {
  FileText,
  Target,
  Layers,
  Search,
  Filter,
  SlidersHorizontal,
  Bookmark,
  Calendar,
  DollarSign,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Code,
  X,
} from 'lucide-react';
import { fetchDocumentClaims, fetchDocumentSections } from '../services/api';

const CLAIM_TYPES = [
  'All',
  'Fact',
  'Numeric',
  'Date',
  'Deadline',
  'Requirement',
  'Entity',
  'Location',
  'Statement',
  'Unknown',
];

export default function DocumentDetail({ document, onClose }) {
  const [activeTab, setActiveTab] = useState('claims');
  const [claims, setClaims] = useState([]);
  const [sections, setSections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [minConfidence, setMinConfidence] = useState(0);
  const [sortBy, setSortBy] = useState('confidence-desc');

  useEffect(() => {
    if (!document) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetchDocumentClaims(document.id),
      fetchDocumentSections(document.id),
    ])
      .then(([claimsData, sectionsData]) => {
        if (!isMounted) return;
        setClaims(claimsData.claims || []);
        setSections(sectionsData.sections || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [document?.id]);

  if (!document) {
    return (
      <div className="empty-box" style={{ padding: '80px 24px' }}>
        <div className="empty-box-icon">
          <Target size={32} />
        </div>
        <p className="empty-box-title">Select a Processed Document</p>
        <span className="empty-box-desc">
          Click &quot;View Results&quot; on any completed document in the repository to inspect extracted claims and ingestion details.
        </span>
      </div>
    );
  }

  // Filter & Sort claims
  const filteredClaims = claims
    .filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.claim.toLowerCase().includes(q) ||
        c.source.toLowerCase().includes(q);
      const matchesType =
        selectedType === 'All' ||
        c.claim_type.toLowerCase() === selectedType.toLowerCase();
      const matchesConf = c.confidence >= minConfidence / 100;
      return matchesSearch && matchesType && matchesConf;
    })
    .sort((a, b) => {
      if (sortBy === 'confidence-desc') return b.confidence - a.confidence;
      if (sortBy === 'confidence-asc') return a.confidence - b.confidence;
      if (sortBy === 'claim-length') return b.claim.length - a.claim.length;
      return 0;
    });

  return (
    <div className="results-view">
      {/* Document Overview Bar */}
      <div className="doc-meta-summary">
        <div className="meta-field">
          <span className="meta-field-label">Document</span>
          <span className="meta-field-val" title={document.filename}>
            {document.filename}
          </span>
        </div>

        <div className="meta-field">
          <span className="meta-field-label">Format</span>
          <span className={`format-tag ${document.type}`}>{document.type}</span>
        </div>

        <div className="meta-field">
          <span className="meta-field-label">Sections Parsed</span>
          <span className="meta-field-val" style={{ color: '#a5b4fc' }}>
            {sections.length || document.section_count || 0}
          </span>
        </div>

        <div className="meta-field">
          <span className="meta-field-label">Claims Extracted</span>
          <span className="meta-field-val" style={{ color: '#34d399' }}>
            {claims.length || document.claim_count || 0}
          </span>
        </div>

        <div className="meta-field">
          <span className="meta-field-label">Status</span>
          <span className={`status-badge ${document.status}`}>{document.status}</span>
        </div>

        {onClose && (
          <button className="btn-remove-staged" onClick={onClose} title="Close results">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Failure Banner if Document Failed */}
      {document.status === 'Failed' && (
        <div className="toast error" style={{ margin: '20px 24px', position: 'static' }}>
          <AlertOctagon size={20} />
          <div>
            <strong>Processing Encountered an Issue:</strong>
            <p>{document.error || 'Unknown parsing or ingestion failure.'}</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs-bar">
        <button
          className={`tab-button ${activeTab === 'claims' ? 'active' : ''}`}
          onClick={() => setActiveTab('claims')}
        >
          <Target size={16} />
          Extracted Claims ({claims.length})
        </button>

        <button
          className={`tab-button ${activeTab === 'sections' ? 'active' : ''}`}
          onClick={() => setActiveTab('sections')}
        >
          <Code size={16} />
          Common Ingestion Structure ({sections.length})
        </button>
      </div>

      {/* Tab: Extracted Claims */}
      {activeTab === 'claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Filters & Search Toolbar */}
          <div className="claims-toolbar">
            <div className="search-wrapper">
              <Search size={15} color="var(--text-dim)" />
              <input
                type="text"
                className="search-input"
                placeholder="Search claims by keyword or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filters-row">
              <div className="filter-item">
                <Filter size={14} />
                <label>Type:</label>
                <select
                  className="filter-select"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  {CLAIM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-item">
                <SlidersHorizontal size={14} />
                <label>Min Conf: {minConfidence}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={minConfidence}
                  className="slider"
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                />
              </div>

              <div className="filter-item">
                <ArrowUpDown size={14} />
                <select
                  className="filter-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="confidence-desc">Highest Confidence</option>
                  <option value="confidence-asc">Lowest Confidence</option>
                  <option value="claim-length">Statement Length</option>
                </select>
              </div>
            </div>
          </div>

          {/* Claims List */}
          <div className="claims-scroll-area">
            {isLoading ? (
              <div className="empty-box">
                <p>Loading verified claims...</p>
              </div>
            ) : filteredClaims.length === 0 ? (
              <div className="empty-box">
                <div className="empty-box-icon">
                  <Filter size={24} />
                </div>
                <p className="empty-box-title">No claims found matching filters</p>
                <span className="empty-box-desc">
                  Try clearing your search query or lowering the confidence threshold.
                </span>
              </div>
            ) : (
              filteredClaims.map((claim) => {
                const confPercent = Math.round(claim.confidence * 100);
                return (
                  <div key={claim.id} className="claim-card">
                    <div className="claim-top-row">
                      <div className="claim-badges-group">
                        <span className={`claim-type-pill ${claim.claim_type}`}>
                          {claim.claim_type}
                        </span>
                        <span className="claim-source-badge">
                          <Bookmark size={11} />
                          {claim.source}
                        </span>
                      </div>

                      <div
                        className="claim-conf-wrapper"
                        title={`Calibrated Confidence: ${(claim.confidence * 100).toFixed(1)}%`}
                      >
                        <span>{confPercent}% Conf.</span>
                        <div className="conf-track">
                          <div
                            className="conf-fill-bar"
                            style={{ width: `${confPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <p className="claim-body-text">{claim.claim}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab: Common Ingestion Structure */}
      {activeTab === 'sections' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(99, 102, 241, 0.08)',
              borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
              fontSize: '0.8rem',
              color: '#a5b4fc',
            }}
          >
            <strong>Phase 2 Common Structure:</strong>{' '}
            <code>&#123;&quot;document_id&quot;, &quot;source&quot;, &quot;location&quot;, &quot;text&quot;&#125;</code>
          </div>

          <div className="claims-scroll-area">
            {sections.length === 0 ? (
              <div className="empty-box">
                <p>No ingested sections available.</p>
              </div>
            ) : (
              sections.map((sec, idx) => (
                <div key={sec.id || idx} className="section-item-card">
                  <div className="section-meta-row">
                    <span className="section-src-tag">{sec.source}</span>
                    <span className="section-loc-label">
                      <Bookmark size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {sec.location}
                    </span>
                  </div>
                  <div className="section-text-content">{sec.text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
