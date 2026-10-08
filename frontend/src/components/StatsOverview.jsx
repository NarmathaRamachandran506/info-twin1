import React from 'react';
import { Files, Layers, Target, Cpu } from 'lucide-react';

export default function StatsOverview({ documents }) {
  const totalDocs = documents.length;
  const totalSections = documents.reduce((sum, d) => sum + (d.section_count || 0), 0);
  const totalClaims = documents.reduce((sum, d) => sum + (d.claim_count || 0), 0);

  return (
    <section className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
          <Files size={20} />
        </div>
        <div>
          <span className="stat-label">Total Documents</span>
          <h3 className="stat-value">{totalDocs}</h3>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
          <Layers size={20} />
        </div>
        <div>
          <span className="stat-label">Ingested Sections</span>
          <h3 className="stat-value">{totalSections}</h3>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
          <Target size={20} />
        </div>
        <div>
          <span className="stat-label">Extracted Claims</span>
          <h3 className="stat-value">{totalClaims}</h3>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
          <Cpu size={20} />
        </div>
        <div>
          <span className="stat-label">Engine Pipeline</span>
          <h3 className="stat-value" style={{ fontSize: '1.05rem', color: '#38bdf8' }}>
            PyMuPDF • DOCX • XLSX
          </h3>
        </div>
      </div>
    </section>
  );
}
