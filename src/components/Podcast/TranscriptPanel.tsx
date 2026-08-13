import React, { useState } from 'react';
import { MessageSquare, X, Download, Copy, CheckCircle, Trash2, FileText } from 'lucide-react';
import type { TranscriptItem } from '../../audio/SpeechToTextEngine';

interface TranscriptPanelProps {
  items: TranscriptItem[];
  onClear: () => void;
  onClose: () => void;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ items, onClear, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const txt = items.map((i) => `[${i.timestamp}] ${i.speaker}: ${i.text}`).join('\n');
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const txt = `===========================================================
PODCAST CRAFT STUDIO — LIVE TRANSCRIPT LOG
===========================================================
Date: ${new Date().toLocaleString()}
Total Statements: ${items.length}
===========================================================

${items.map((i) => `[${i.timestamp}] ${i.speaker.toUpperCase()} (${i.role.toUpperCase()}):
${i.text}\n`).join('\n')}
===========================================================`;

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Podcast_Transcript_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleDownloadSrt = () => {
    let srt = '';
    items.forEach((item, index) => {
      const startSec = item.seconds;
      const endSec = startSec + 4; // Default 4s caption duration
      const formatSrtTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},000`;
      };

      srt += `${index + 1}\n`;
      srt += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n`;
      srt += `${item.speaker}: ${item.text}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Podcast_Subtitles_${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '640px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare className="daw-logo-icon" size={20} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>LIVE SPEECH TRANSCRIPT & CAPTIONS</h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {items.length} STATEMENT(S) LOGGED IN SESSION
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Transcript List */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#06080d', borderRadius: '8px', border: '1px solid var(--border-dim)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '60px' }}>
              No speech captured yet. When speakers talk during active recording, live closed-captions and transcript logs will stream here automatically.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'var(--bg-darker)',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${item.role === 'host' ? 'var(--accent-cyan)' : 'var(--accent-amber)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.72rem' }}>
                  <span style={{ fontWeight: 700, color: item.role === 'host' ? 'var(--accent-cyan)' : 'var(--accent-amber)' }}>
                    {item.speaker} ({item.role.toUpperCase()})
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>[{item.timestamp}]</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#fff', lineHeight: '1.4' }}>{item.text}</div>
              </div>
            ))
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-dim)' }}>
          <button className="btn-transport" onClick={onClear} disabled={items.length === 0}>
            <Trash2 size={14} /> Clear Log
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-transport" onClick={handleCopy} disabled={items.length === 0}>
              {copied ? <CheckCircle size={14} color="#00ff87" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn-transport" onClick={handleDownloadSrt} disabled={items.length === 0}>
              <FileText size={14} /> Export Subtitle .SRT
            </button>
            <button className="btn-transport btn-cyan" onClick={handleDownloadTxt} disabled={items.length === 0}>
              <Download size={14} /> Export Transcript .TXT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
