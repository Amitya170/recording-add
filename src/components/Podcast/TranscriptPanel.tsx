import React, { useState } from 'react';
import { MessageSquare, X, Download, Copy, CheckCircle, Trash2, FileText, Globe } from 'lucide-react';
import { type TranscriptItem, formatAsSRT, formatAsVTT, formatAsTXT } from '../../audio/SpeechToTextEngine';

interface TranscriptPanelProps {
  items: TranscriptItem[];
  onClear: () => void;
  onClose: () => void;
  currentLanguage?: string;
  onLanguageChange?: (lang: string) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (ES)' },
  { code: 'fr-FR', label: 'French (FR)' },
  { code: 'de-DE', label: 'German (DE)' },
  { code: 'hi-IN', label: 'Hindi (India)' },
  { code: 'ja-JP', label: 'Japanese (JP)' },
  { code: 'pt-BR', label: 'Portuguese (BR)' },
];

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  items,
  onClear,
  onClose,
  currentLanguage = 'en-US',
  onLanguageChange,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedLang, setSelectedLang] = useState(currentLanguage);

  const handleLangSelect = (code: string) => {
    setSelectedLang(code);
    onLanguageChange?.(code);
  };

  const handleCopy = () => {
    const txt = items.map((i) => `[${i.timestamp}] ${i.speaker}: ${i.text}`).join('\n');
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleDownloadTxt = () => {
    const txt = formatAsTXT(items);
    downloadBlob(txt, `Podcast_Transcript_${Date.now()}.txt`, 'text/plain');
  };

  const handleDownloadSrt = () => {
    const srt = formatAsSRT(items);
    downloadBlob(srt, `Podcast_Subtitles_${Date.now()}.srt`, 'text/plain');
  };

  const handleDownloadVtt = () => {
    const vtt = formatAsVTT(items);
    downloadBlob(vtt, `Podcast_Captions_${Date.now()}.vtt`, 'text/vtt');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '680px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Globe size={13} color="var(--accent-cyan)" />
              <select
                className="daw-select"
                style={{ padding: '2px 8px', height: '26px', fontSize: '0.72rem' }}
                value={selectedLang}
                onChange={(e) => handleLangSelect(e.target.value)}
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-dim)', flexWrap: 'wrap', gap: '8px' }}>
          <button className="btn-transport" onClick={onClear} disabled={items.length === 0}>
            <Trash2 size={14} /> Clear Log
          </button>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn-transport" onClick={handleCopy} disabled={items.length === 0}>
              {copied ? <CheckCircle size={14} color="#00ff87" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn-transport" onClick={handleDownloadVtt} disabled={items.length === 0}>
              <FileText size={14} /> WebVTT (.vtt)
            </button>
            <button className="btn-transport" onClick={handleDownloadSrt} disabled={items.length === 0}>
              <FileText size={14} /> Subtitle (.srt)
            </button>
            <button className="btn-transport btn-cyan" onClick={handleDownloadTxt} disabled={items.length === 0}>
              <Download size={14} /> Transcript (.txt)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

