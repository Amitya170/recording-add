import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  const shortcuts = [
    { key: 'Space', desc: 'Start / Stop Playback or Recording' },
    { key: 'R', desc: 'Toggle Studio Recording' },
    { key: 'M', desc: 'Drop Cue Marker at Playhead' },
    { key: 'Esc', desc: 'Close open modal dialogs' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border-dim)',
            paddingBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard className="daw-logo-icon" size={20} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>STUDIO KEYBOARD SHORTCUTS</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {shortcuts.map((s) => (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-darker)',
                padding: '8px 12px',
                borderRadius: '6px',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.desc}</span>
              <kbd
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  padding: '3px 8px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: '4px',
                  color: 'var(--accent-cyan)',
                  boxShadow: '0 2px 0 rgba(0,0,0,0.5)',
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-transport btn-cyan" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
