import React, { useState } from 'react';
import { Download, X, FileAudio, Users } from 'lucide-react';
import { encodeWav, type BitDepth } from '../../audio/encoders/WavEncoder';

interface ExportModalProps {
  audioBuffer: AudioBuffer | null;
  speakerABuffer?: AudioBuffer | null;
  speakerBBuffer?: AudioBuffer | null;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  audioBuffer,
  speakerABuffer,
  speakerBBuffer,
  onClose,
}) => {
  const [format, setFormat] = useState<'wav16' | 'wav24' | 'wav32'>('wav16');
  const [exportMode, setExportMode] = useState<'stereo' | 'separate'>('stereo');
  const [title, setTitle] = useState<string>('Podcast Recording');
  const [artist, setArtist] = useState<string>('Podcast Craft Studio');

  if (!audioBuffer) return null;

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;

  const getEstimatedSizeMb = (buf: AudioBuffer, depth: number) => {
    return (buf.duration * buf.sampleRate * buf.numberOfChannels * (depth / 8)) / (1024 * 1024);
  };

  const depth: BitDepth = format === 'wav16' ? 16 : format === 'wav24' ? 24 : 32;

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleDownload = () => {
    const sanitized = title.replace(/\s+/g, '_');

    if (exportMode === 'stereo') {
      const blob = encodeWav(audioBuffer, depth);
      downloadBlob(blob, `${sanitized}_stereo_${format}.wav`);
    } else {
      // Export separate mono tracks
      if (speakerABuffer) {
        const blobA = encodeWav(speakerABuffer, depth);
        downloadBlob(blobA, `${sanitized}_SpeakerA_${format}.wav`);
      }
      if (speakerBBuffer) {
        const blobB = encodeWav(speakerBBuffer, depth);
        downloadBlob(blobB, `${sanitized}_SpeakerB_${format}.wav`);
      }
    }
    onClose();
  };

  const hasBothSpeakers = !!speakerABuffer && !!speakerBBuffer;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileAudio className="daw-logo-icon" size={20} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>EXPORT PODCAST AUDIO</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Export Mode — Stereo vs Separate */}
        {hasBothSpeakers && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>EXPORT MODE</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                className={`btn-transport ${exportMode === 'stereo' ? 'btn-cyan' : ''}`}
                style={{ width: '100%' }}
                onClick={() => setExportMode('stereo')}
              >
                <Users size={14} /> Stereo Mix (L+R)
              </button>
              <button
                className={`btn-transport ${exportMode === 'separate' ? 'btn-cyan' : ''}`}
                style={{ width: '100%' }}
                onClick={() => setExportMode('separate')}
              >
                <FileAudio size={14} /> Separate Tracks
              </button>
            </div>
          </div>
        )}

        {/* Format Selector */}
        <div className="control-group" style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ENCODING FORMAT</label>
          <select className="daw-select" value={format} onChange={(e) => setFormat(e.target.value as any)}>
            <option value="wav16">PCM WAV 16-Bit (CD Quality)</option>
            <option value="wav24">PCM WAV 24-Bit (High Resolution)</option>
            <option value="wav32">IEEE Float WAV 32-Bit (Studio Master)</option>
          </select>
        </div>

        {/* Audio Summary */}
        <div style={{ background: 'var(--bg-darker)', padding: '12px', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'var(--text-secondary)' }}>
          <div>Duration: <span style={{ color: '#fff' }}>{duration.toFixed(2)}s</span></div>
          <div>Sample Rate: <span style={{ color: '#fff' }}>{sampleRate} Hz</span></div>
          <div>Channels: <span style={{ color: '#fff' }}>{exportMode === 'stereo' ? `${channels} (Stereo)` : '1 (Mono × 2 files)'}</span></div>
          <div>Est Size: <span style={{ color: 'var(--accent-cyan)' }}>
            {exportMode === 'stereo'
              ? `${getEstimatedSizeMb(audioBuffer, depth).toFixed(2)} MB`
              : `${((speakerABuffer ? getEstimatedSizeMb(speakerABuffer, depth) : 0) + (speakerBBuffer ? getEstimatedSizeMb(speakerBBuffer, depth) : 0)).toFixed(2)} MB total`
            }
          </span></div>
        </div>

        {/* Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div className="login-field">
            <label>SESSION TITLE</label>
            <input className="daw-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="login-field">
            <label>ARTIST / PODCAST NAME</label>
            <input className="daw-input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn-transport" onClick={onClose}>Cancel</button>
          <button className="btn-transport btn-cyan" onClick={handleDownload}>
            <Download size={14} />
            {exportMode === 'stereo' ? 'Download Stereo WAV' : 'Download Separate WAVs'}
          </button>
        </div>
      </div>
    </div>
  );
};
