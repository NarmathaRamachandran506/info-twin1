import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const getIcon = () => {
          switch (toast.type) {
            case 'success':
              return <CheckCircle2 size={18} />;
            case 'error':
              return <AlertCircle size={18} />;
            case 'warning':
              return <AlertTriangle size={18} />;
            default:
              return <Info size={18} />;
          }
        };

        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {getIcon()}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
