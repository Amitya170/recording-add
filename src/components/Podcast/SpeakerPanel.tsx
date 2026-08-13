import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Radio, Wifi, Eye, Sliders, Sparkles } from 'lucide-react';
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorHex = color === 'cyan' ? '#00f0ff' : '#ffb700';
  const colorDim = color === 'cyan' ? 'rgba(0,240,255,0.12)' : 'rgba(255,183,0,0.12)';
  const colorBorder = color === 'cyan' ? 'rgba(0,240,255,0.35)' : 'rgba(255,183,0,0.35)';

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

      ctx.fillStyle = '#090d14';
      ctx.fillRect(0, 0, w, h);

      // Grid line
      ctx.strokeStyle = '#151d2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (analysisData?.timeData && !isMuted && isConnected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = colorHex;
        ctx.shadowColor = colorHex;
        ctx.shadowBlur = 8;
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
        // Flat line when muted or disconnected
        ctx.strokeStyle = isMuted ? 'rgba(255,42,95,0.4)' : '#232e42';
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
  }, [analysisData, isMuted, isConnected, colorHex]);

  const peakDb = analysisData?.peakLeftDb ?? -60;
  const peakPercent = Math.max(0, Math.min(100, ((peakDb + 60) / 63) * 100));
  const isClipping = analysisData?.isClipping ?? false;

  return (
    <div className={`speaker-panel ${isSolo ? 'solo-active' : ''}`} style={{ borderColor: colorBorder }}>
      {/* Header Info */}
      <div className="speaker-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="speaker-avatar"
            style={{ background: colorDim, borderColor: colorBorder, color: colorHex }}
          >
            {(userName || label).charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="speaker-name" style={{ color: colorHex }}>{label}</span>
              <span className={`role-badge ${role === 'host' ? 'role-admin' : 'role-user'}`}>
                {role.toUpperCase()}
              </span>
            </div>
            <div className="speaker-username">{userName || 'Remote Speaker'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onToggleNoiseSuppression && (
            <button
              className={`btn-solo ${isNoiseSuppressed ? 'active' : ''}`}
              onClick={onToggleNoiseSuppression}
              title="Toggle AI Spectral Noise Suppression Gate"
              style={{
                background: isNoiseSuppressed ? 'rgba(0, 240, 255, 0.15)' : 'var(--bg-darker)',
                borderColor: isNoiseSuppressed ? colorHex : 'var(--border-dim)',
                color: isNoiseSuppressed ? colorHex : 'var(--text-muted)',
              }}
            >
              <Sparkles size={12} /> {isNoiseSuppressed ? 'AI NOISE ON' : 'AI NOISE OFF'}
            </button>
          )}

          {onOpenFx && (
            <button
              className="btn-solo"
              onClick={onOpenFx}
              title="Open Live DSP FX Processor Rack"
              style={{ background: 'var(--bg-darker)', color: colorHex, borderColor: colorBorder }}
            >
              <Sliders size={12} /> FX RACK
            </button>
          )}

          <button
            className={`btn-solo ${isSolo ? 'active' : ''}`}
            onClick={onToggleSolo}
            title="Solo Speaker Audio Channel"
          >
            <Eye size={12} /> SOLO
          </button>

          <div className={`speaker-status ${isConnected ? 'status-active' : 'status-inactive'}`}>
            <Wifi size={12} />
            {isConnected ? (isMuted ? 'MUTED' : 'LIVE') : 'NO MIC'}
          </div>
        </div>
      </div>

      {/* Mic Device Selector & Vocal Chain Presets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div className="speaker-device-row">
          <label className="speaker-device-label">MICROPHONE HARDWARE INPUT</label>
          <select
            className="daw-select"
            value={selectedDeviceId}
            onChange={(e) => onDeviceChange(e.target.value)}
          >
            <option value="">Select Microphone Input...</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="speaker-device-row">
          <label className="speaker-device-label">VOCAL CHAIN DSP PRESET</label>
          <select className="daw-select" defaultValue="warm">
            <option value="warm">🎙️ Broadcaster Warm Vocal</option>
            <option value="radio">📻 Radio Punch EQ</option>
            <option value="gate">🔇 Aggressive Noise Gate</option>
            <option value="flat">🎧 Flat Reference (Bypass)</option>
          </select>
        </div>
      </div>

      {/* Primary Mute Microphone Button */}
      <button
        className={`btn-mute ${isMuted ? 'muted' : ''}`}
        onClick={onToggleMute}
        style={{
          borderColor: isMuted ? 'rgba(255,42,95,0.6)' : colorBorder,
          color: isMuted ? '#ff2a5f' : colorHex,
          background: isMuted ? 'rgba(255,42,95,0.12)' : colorDim,
        }}
        disabled={!isConnected}
      >
        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        <span>{isMuted ? 'MICROPHONE MUTED (CLICK TO UNMUTE)' : 'MICROPHONE ACTIVE (CLICK TO MUTE)'}</span>
      </button>

      {/* Input Gain Slider & Level Meter */}
      <div className="speaker-controls-grid">
        <div className="control-group" style={{ marginBottom: 0 }}>
          <div className="control-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Volume2 size={12} /> INPUT GAIN
            </span>
            <span className="val">{Math.round(gain * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={gain}
            onChange={(e) => onGainChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="speaker-meter-section">
          <div className="speaker-meter-label">
            <span>PEAK LEVEL</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: isClipping ? '#ff2a5f' : colorHex }}>
              {peakDb.toFixed(1)} dB
            </span>
            {isClipping && <span className="clip-badge">CLIP</span>}
          </div>
          <div className="speaker-meter-track">
            <div
              className="speaker-meter-fill"
              style={{
                width: `${peakPercent}%`,
                background: isClipping
                  ? 'linear-gradient(90deg, #00ff87, #ffb700, #ff2a5f)'
                  : `linear-gradient(90deg, ${colorHex}88, ${colorHex})`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Mini Visualizer Canvas */}
      <div className="speaker-oscillogram">
        <canvas ref={canvasRef} width={400} height={70} className="visualizer-canvas" />
      </div>

      {/* Live Recording Badge */}
      {isRecording && !isMuted && isConnected && (
        <div className="speaker-recording-indicator" style={{ color: '#ff2a5f' }}>
          <Radio size={14} /> RECORDING CHANNEL {color === 'cyan' ? 'L (HOST)' : 'R (GUEST)'}
        </div>
      )}
    </div>
  );
};
