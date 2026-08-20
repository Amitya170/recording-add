import React, { useState, useMemo } from 'react';
import { MessageSquare, X, Download, Copy, CheckCircle, Trash2, FileText, Globe, Search } from 'lucide-react';
import { type TranscriptItem, formatAsSRT, formatAsVTT, formatAsTXT } from '../../audio/SpeechToTextEngine';

interface TranscriptPanelProps {
  items: TranscriptItem[];
  onClear: () => void;
  onClose?: () => void;
  currentLanguage?: string;
  onLanguageChange?: (lang: string) => void;
  embedded?: boolean;
  onSeekAudio?: (timeSeconds: number) => void;
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
  embedded = false,
  onSeekAudio,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedLang, setSelectedLang] = useState(currentLanguage);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Convert timestamp string (e.g. "00:12" or "01:23.4") to seconds
  const parseTimestampToSeconds = (ts: string): number => {
    try {
      const parts = ts.split(':');
      if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      } else if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }
    } catch {
      // fallback
    }
    return 0;
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) => item.text.toLowerCase().includes(q) || item.speaker.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const content = (
    <div className={embedded ? 'creator-pane-card' : 'modal-card'} style={embedded ? { height: '100%' } : { width: '680px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="creator-pane-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare className="daw-logo-icon" size={18} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              LIVE SYNCED TRANSCRIPT & STORYBOARD
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {items.length} STATEMENT(S) LOGGED IN THIS SESSION
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Search bar */}
          <div className="embedded-transcript-search">
            <Search size={12} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Language selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Globe size={13} color="var(--accent-cyan)" />
            <select
              className="daw-select"
              style={{ padding: '2px 6px', height: '26px', fontSize: '0.7rem' }}
              value={selectedLang}
              onChange={(e) => handleLangSelect(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {!embedded && onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Transcript List */}
      <div className="embedded-transcript-list">
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '40px 16px', background: 'var(--bg-darkest)', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            {searchQuery
              ? `No spoken lines match "${searchQuery}"`
              : '🎙️ Live transcript will stream here in real-time as Host and Guest speak during recording. Click any sentence to jump the audio playhead.'}
          </div>
        ) : (
          filteredItems.map((item) => {
            const timeSec = parseTimestampToSeconds(item.timestamp);
            return (
              <div
                key={item.id}
                className={`transcript-sentence-bubble ${item.role === 'host' ? 'bubble-host' : 'bubble-guest'}`}
                onClick={() => onSeekAudio?.(timeSec)}
                title="Click to seek audio playhead to this line"
              >
                <div className="transcript-bubble-top">
                  <span
                    className="transcript-bubble-speaker"
                    style={{ color: item.role === 'host' ? 'var(--accent-cyan)' : 'var(--accent-amber)' }}
                  >
                    {item.speaker} ({item.role.toUpperCase()})
                  </span>
                  <span className="transcript-bubble-time">
                    ⏱️ [{item.timestamp}]
                  </span>
                </div>
                <div className="transcript-bubble-text">{item.text}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-dim)', flexWrap: 'wrap', gap: '8px' }}>
        <button className="creator-quick-btn" onClick={onClear} disabled={items.length === 0} style={{ opacity: items.length === 0 ? 0.5 : 1 }}>
          <Trash2 size={12} /> Clear
        </button>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button className="creator-quick-btn" onClick={handleCopy} disabled={items.length === 0} style={{ opacity: items.length === 0 ? 0.5 : 1 }}>
            {copied ? <CheckCircle size={12} color="#16a34a" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="creator-quick-btn" onClick={handleDownloadVtt} disabled={items.length === 0} style={{ opacity: items.length === 0 ? 0.5 : 1 }}>
            <FileText size={12} /> .VTT
          </button>
          <button className="creator-quick-btn" onClick={handleDownloadSrt} disabled={items.length === 0} style={{ opacity: items.length === 0 ? 0.5 : 1 }}>
            <FileText size={12} /> .SRT
          </button>
          <button className="creator-quick-btn active-cyan" onClick={handleDownloadTxt} disabled={items.length === 0} style={{ opacity: items.length === 0 ? 0.5 : 1 }}>
            <Download size={12} /> .TXT
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
};


