import React from 'react';
import { Bookmark, Trash2 } from 'lucide-react';

export interface Marker {
  id: string;
  time: number;
  label: string;
}

interface MarkerListProps {
  markers: Marker[];
  onDeleteMarker: (id: string) => void;
  onJumpToMarker: (time: number) => void;
}

export const MarkerList: React.FC<MarkerListProps> = ({
  markers,
  onDeleteMarker,
  onJumpToMarker,
}) => {
  return (
    <div className="card-panel" style={{ maxHeight: '180px' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bookmark size={14} className="daw-logo-icon" />
          <span>CUE MARKERS & ANNOTATIONS</span>
        </div>
        <span className="tag">{markers.length} MARKERS</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {markers.length === 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            No cue points added yet. Press 'Add Cue Point' or 'M' key during editing.
          </div>
        ) : (
          markers.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-card)',
                padding: '6px 10px',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
              }}
            >
              <div
                style={{ cursor: 'pointer', color: 'var(--accent-cyan)' }}
                onClick={() => onJumpToMarker(m.time)}
              >
                [{m.time.toFixed(2)}s] {m.label}
              </div>
              <button
                onClick={() => onDeleteMarker(m.id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
