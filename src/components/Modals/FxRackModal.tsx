import React, { useState } from 'react';
import { Sliders, X, Zap, Activity, CheckCircle, RotateCcw } from 'lucide-react';
import type { SpeakerAudioEngine } from '../../audio/AudioEngine';
import { DEFAULT_FX_CONFIG, type FxConfig } from '../../audio/FxRackEngine';

interface FxRackModalProps {
  engine: SpeakerAudioEngine | null;
  speakerLabel: string;
  onClose: () => void;
}

export const FxRackModal: React.FC<FxRackModalProps> = ({ engine, speakerLabel, onClose }) => {
  const [config, setConfig] = useState<FxConfig>(
    engine ? { ...engine.fxConfig } : { ...DEFAULT_FX_CONFIG }
  );

  const updateField = <K extends keyof FxConfig>(field: K, val: FxConfig[K]) => {
    const next = { ...config, [field]: val };
    setConfig(next);
    engine?.updateFxConfig(next);
  };

  const handleReset = () => {
    const next = { ...DEFAULT_FX_CONFIG };
    setConfig(next);
    engine?.updateFxConfig(next);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '600px', maxWidth: '95vw' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders className="daw-logo-icon" size={20} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>STUDIO DSP FX PROCESSOR RACK</h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>
                {speakerLabel.toUpperCase()} — REAL-TIME AUDIO PROCESSING
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* DSP Rack Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Section 1: High Pass Filter (Low Cut) */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} /> HIGH-PASS FILTER (LOW CUT)
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#fff' }}>
                {config.highPassFreq <= 0 ? 'BYPASSED' : `${config.highPassFreq} Hz`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[0, 40, 80, 120, 200].map((freq) => (
                <button
                  key={freq}
                  className={`btn-transport ${config.highPassFreq === freq ? 'btn-cyan' : ''}`}
                  style={{ flex: 1, padding: '4px', fontSize: '0.7rem' }}
                  onClick={() => updateField('highPassFreq', freq)}
                >
                  {freq === 0 ? 'OFF' : `${freq}Hz`}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: 3-Band Parametric Equalizer */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-green)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} /> 3-BAND PARAMETRIC EQUALIZER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  LOW BASS (120Hz): <strong style={{ color: '#fff' }}>{config.eqLowGain > 0 ? `+${config.eqLowGain}` : config.eqLowGain} dB</strong>
                </label>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={config.eqLowGain}
                  onChange={(e) => updateField('eqLowGain', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  MID PRESENCE (1.5kHz): <strong style={{ color: '#fff' }}>{config.eqMidGain > 0 ? `+${config.eqMidGain}` : config.eqMidGain} dB</strong>
                </label>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={config.eqMidGain}
                  onChange={(e) => updateField('eqMidGain', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  HIGH AIR (8kHz): <strong style={{ color: '#fff' }}>{config.eqHighGain > 0 ? `+${config.eqHighGain}` : config.eqHighGain} dB</strong>
                </label>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={config.eqHighGain}
                  onChange={(e) => updateField('eqHighGain', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Studio Dynamic Compressor */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} /> DYNAMIC STUDIO COMPRESSOR
              </span>
              <button
                className={`btn-transport ${config.compEnabled ? 'btn-cyan' : ''}`}
                style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                onClick={() => updateField('compEnabled', !config.compEnabled)}
              >
                {config.compEnabled ? 'ENABLED' : 'BYPASS'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  THRESHOLD: <strong style={{ color: '#fff' }}>{config.compThreshold} dBFS</strong>
                </label>
                <input
                  type="range"
                  min="-40"
                  max="0"
                  step="1"
                  disabled={!config.compEnabled}
                  value={config.compThreshold}
                  onChange={(e) => updateField('compThreshold', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  RATIO: <strong style={{ color: '#fff' }}>{config.compRatio}:1</strong>
                </label>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="0.5"
                  disabled={!config.compEnabled}
                  value={config.compRatio}
                  onChange={(e) => updateField('compRatio', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Brickwall Limiter & Master Trim */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c084fc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} /> BRICKWALL LIMITER & MASTER TRIM
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  LIMITER CEILING: <strong style={{ color: '#fff' }}>{config.limiterCeiling} dBFS</strong>
                </label>
                <input
                  type="range"
                  min="-3.0"
                  max="-0.1"
                  step="0.1"
                  value={config.limiterCeiling}
                  onChange={(e) => updateField('limiterCeiling', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  MASTER GAIN TRIM: <strong style={{ color: 'var(--accent-cyan)' }}>{config.masterGain.toFixed(2)}x</strong>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={config.masterGain}
                  onChange={(e) => updateField('masterGain', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-dim)' }}>
          <button className="btn-transport" onClick={handleReset}>
            <RotateCcw size={14} /> Reset Defaults
          </button>
          <button className="btn-transport btn-cyan" onClick={onClose}>
            <CheckCircle size={14} /> Apply & Close Rack
          </button>
        </div>
      </div>
    </div>
  );
};
