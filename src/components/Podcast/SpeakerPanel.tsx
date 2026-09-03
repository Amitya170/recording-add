import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Radio, Wifi, Eye, Sliders, Sparkles, Activity } from 'lucide-react';
import type { DeviceInfo } from '../../audio/AudioEngine';
import type { AnalysisData } from '../../audio/AnalyserEngine';

interface SpeakerPanelProps {
  label: string; // "SPEAKER A (HOST)" or "SPEAKER B (GUEST)"
  role: 'host' | 'guest';
  color: 'cyan' | 'amber';
  devices: DeviceInfo[];
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  gain: number;
  onGainChange: (val: number) => void;
  isSolo: boolean;
  onToggleSolo: () => void;
  analysisData: AnalysisData | null;
  isRecording: boolean;
  isConnected: boolean;
  userName?: string;
  onOpenFx?: () => void;
  isNoiseSuppressed?: boolean;
  onToggleNoiseSuppression?: () => void;
  vocalPreset?: string;
  onPresetChange?: (preset: string) => void;
}

export const SpeakerPanel: React.FC<SpeakerPanelProps> = ({
  label,
  role,
  color,
  devices,
  selectedDeviceId,
  onDeviceChange,
  isMuted,
  onToggleMute,
  gain,
  onGainChange,
  isSolo,
  onToggleSolo,
  analysisData,
  isRecording,
  isConnected,
  userName,
  onOpenFx,
  isNoiseSuppressed = true,
  onToggleNoiseSuppression,
  vocalPreset = 'warm',
  onPresetChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorHex = color === 'cyan' ? 'var(--accent-cyan)' : 'var(--accent-amber)';
  const colorGlow = color === 'cyan' ? 'var(--accent-cyan-glow)' : 'var(--accent-amber-glow)';
  const colorDim = color === 'cyan' ? 'rgba(2, 132, 199, 0.12)' : 'rgba(217, 119, 6, 0.12)';

  const peakDb = analysisData?.peakLeftDb ?? -60;
  const peakPercent = Math.max(0, Math.min(100, ((peakDb + 60) / 63) * 100));
  const isClipping = analysisData?.isClipping ?? false;

  // Real-time audio reactive halo calculation
  const isAudioActive = isConnected && !isMuted && peakDb > -50;
  const haloScale = isAudioActive ? Math.min(1.35, 1 + Math.max(0, (peakDb + 50) / 45) * 0.35) : 1;
  const haloOpacity = isAudioActive ? Math.min(0.9, Math.max(0.2, (peakDb + 50) / 40)) : 0;

  // Mini oscillogram rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.fillStyle = isDark ? '#080c14' : '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      // Center Reference Grid line
      ctx.strokeStyle = isDark ? '#141d2c' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (analysisData?.timeData && !isMuted && isConnected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = color === 'cyan' ? '#0284c7' : '#d97706';
        if (isDark) {
          ctx.strokeStyle = color === 'cyan' ? '#00f0ff' : '#ffb700';
          ctx.shadowColor = color === 'cyan' ? '#00f0ff' : '#ffb700';
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();

        const data = analysisData.timeData;
        const sliceW = w / data.length;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const y = ((data[i] + 1) / 2) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceW;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Flat reference line when muted or idle
        ctx.strokeStyle = isMuted ? 'rgba(225, 29, 72, 0.4)' : (isDark ? '#1c2638' : '#cbd5e1');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [analysisData, isMuted, isConnected, color]);

  return (
    <div className={`creator-speaker-card ${isSolo ? 'is-solo' : ''}`}>
      {/* Top Header: Avatar with Audio Halo + Name + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div className="speaker-stage-avatar-container">
          <div className="speaker-stage-avatar-wrapper">
            {/* Glowing Audio Halo Ring */}
            <div
              className="speaker-halo-ring"
              style={{
                background: colorGlow,
                border: `2px solid ${colorHex}`,
                transform: `scale(${haloScale})`,
                opacity: haloOpacity,
                boxShadow: `0 0 16px ${colorHex}`,
              }}
            />
            {/* Speaker Avatar */}
            <div
              className="speaker-stage-avatar"
              style={{
                background: colorDim,
                borderColor: colorHex,
                color: colorHex,
              }}
            >
              {(userName || label).charAt(0).toUpperCase()}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {label}
              </span>
              <span className={`role-badge ${role === 'host' ? 'role-admin' : 'role-user'}`}>
                {role.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {userName || (role === 'host' ? 'Host Broadcaster' : 'Remote Guest')}
            </div>
          </div>
        </div>

        {/* Live Channel Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`speaker-status ${isConnected ? (isMuted ? 'status-inactive' : 'status-active') : 'status-inactive'}`}>
            <Wifi size={12} />
            {isConnected ? (isMuted ? 'MIC MUTED' : 'LIVE ON-AIR') : 'NO MIC DETECTED'}
          </div>
          {isRecording && !isMuted && isConnected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-red)' }}>
              <Radio size={12} className="live-pulse-dot" /> REC
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="creator-quick-toolbar">
        {/* Primary Mute / Unmute Button */}
        <button
          type="button"
          className={`creator-quick-btn ${isMuted ? 'active-red' : (color === 'cyan' ? 'active-cyan' : 'active-amber')}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {isMuted ? <MicOff size={14} color="var(--accent-red)" /> : <Mic size={14} />}
          <span>{isMuted ? 'MUTED' : 'MIC ACTIVE'}</span>
        </button>

        {/* AI Noise Suppression Toggle */}
        {onToggleNoiseSuppression && (
          <button
            type="button"
            className={`creator-quick-btn ${isNoiseSuppressed ? (color === 'cyan' ? 'active-cyan' : 'active-amber') : ''}`}
            onClick={onToggleNoiseSuppression}
            title="Toggle AI Spectral Noise Suppression Gate"
          >
            <Sparkles size={13} />
            <span>{isNoiseSuppressed ? 'AI NOISE: ON' : 'AI NOISE: OFF'}</span>
          </button>
        )}

        {/* DSP FX Rack Button */}
        {onOpenFx && (
          <button
            type="button"
            className="creator-quick-btn"
            onClick={onOpenFx}
            title="Open Live DSP FX Processor Rack (EQ, Compressor, Limiter)"
          >
            <Sliders size={13} />
            <span>FX RACK</span>
          </button>
        )}

        {/* Solo Button */}
        <button
          type="button"
          className={`creator-quick-btn ${isSolo ? 'active-amber' : ''}`}
          onClick={onToggleSolo}
          title="Solo Speaker Channel"
        >
          <Eye size={13} />
          <span>SOLO</span>
        </button>
      </div>

      {/* Hardware Device & Vocal Chain Presets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
            {role === 'guest' ? 'AUDIO SOURCE' : 'MIC INPUT HARDWARE'}
          </label>
          {role === 'guest' ? (
            <div
              className="daw-select"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '34px',
                fontSize: '0.75rem',
                color: isConnected ? 'var(--accent-green)' : 'var(--text-muted)',
                background: 'rgba(255,255,255,0.04)',
                border: isConnected ? '1px solid rgba(0,255,135,0.3)' : '1px solid var(--border-dim)',
                cursor: 'default',
              }}
            >
              <Radio size={13} color={isConnected ? 'var(--accent-green)' : 'var(--accent-amber)'} />
              <span>{isConnected ? '📡 Remote WebRTC (Guest Mic)' : 'Waiting for Remote Guest...'}</span>
            </div>
          ) : (
            <select
              className="daw-select"
              value={selectedDeviceId}
              onChange={(e) => onDeviceChange(e.target.value)}
              style={{ width: '100%', fontSize: '0.75rem' }}
            >
              <option value="">Select Microphone Input...</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
            VOCAL CHAIN PRESET
          </label>
          <select
            className="daw-select"
            value={vocalPreset}
            onChange={(e) => onPresetChange?.(e.target.value)}
            style={{ width: '100%', fontSize: '0.75rem' }}
          >
            <option value="warm">🎙️ Broadcaster Warm Vocal</option>
            <option value="radio">📻 Radio Punch EQ</option>
            <option value="gate">🔇 Aggressive Noise Gate</option>
            <option value="flat">🎧 Flat Reference (Bypass)</option>
          </select>
        </div>
      </div>

      {/* Input Gain Slider & Segmented Peak Level Meter */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Volume2 size={12} /> INPUT GAIN
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {Math.round(gain * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={gain}
            onChange={(e) => onGainChange(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: colorHex }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={12} /> PEAK LEVEL
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: isClipping ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                {peakDb.toFixed(1)} dB
              </span>
              {isClipping && <span className="clip-badge">CLIP</span>}
            </div>
          </div>
          <div className="speaker-meter-track" style={{ height: '8px', borderRadius: '4px' }}>
            <div
              className="speaker-meter-fill"
              style={{
                width: `${peakPercent}%`,
                background: isClipping
                  ? 'linear-gradient(90deg, #16a34a, #d97706, #e11d48)'
                  : (color === 'cyan'
                      ? 'linear-gradient(90deg, #0284c7, #00f0ff)'
                      : 'linear-gradient(90deg, #d97706, #ffb700)'),
              }}
            />
          </div>
        </div>
      </div>

      {/* Mini Oscillogram Visualizer Canvas */}
      <div style={{ height: '56px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
        <canvas ref={canvasRef} width={420} height={56} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
};

