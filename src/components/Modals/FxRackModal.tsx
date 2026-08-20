import React, { useState } from 'react';
import { Sliders, X, Zap, Activity, CheckCircle, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import type { SpeakerAudioEngine } from '../../audio/AudioEngine';
import { DEFAULT_FX_CONFIG, VOCAL_PRESETS, type FxConfig } from '../../audio/FxRackEngine';

interface FxRackModalProps {
  engine: SpeakerAudioEngine | null;
  speakerLabel: string;
  onClose: () => void;
}

export const FxRackModal: React.FC<FxRackModalProps> = ({ engine, speakerLabel, onClose }) => {
  const [config, setConfig] = useState<FxConfig>(
    engine ? { ...engine.fxConfig } : { ...DEFAULT_FX_CONFIG }
  );
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const updateField = <K extends keyof FxConfig>(field: K, val: FxConfig[K]) => {
    setActivePreset(null);
    const next = { ...config, [field]: val };
    setConfig(next);
    engine?.updateFxConfig(next);
  };

  const handleApplyPreset = (key: string) => {
    setActivePreset(key);
    const preset = VOCAL_PRESETS[key] || DEFAULT_FX_CONFIG;
    setConfig({ ...preset });
    engine?.applyVocalPreset(key);
  };

  const handleReset = () => {
    setActivePreset('flat');
    const next = { ...DEFAULT_FX_CONFIG };
    setConfig(next);
    engine?.updateFxConfig(next);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '680px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders className="daw-logo-icon" size={22} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>STUDIO DSP FX PROCESSOR RACK</h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>
                {speakerLabel.toUpperCase()} — 64-BIT PARAMETRIC EQ, NOISE GATE & DYNAMICS
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* 1-Click Vocal Presets Bar */}
        <div style={{ background: 'rgba(0, 240, 255, 0.04)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-dim)', marginBottom: '14px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Sparkles size={12} /> 1-CLICK VOCAL MASTERING PRESETS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
            <button
              type="button"
              className={`creator-quick-btn ${activePreset === 'warm' ? 'active-cyan' : ''}`}
              style={{ fontSize: '0.68rem', justifyContent: 'center' }}
              onClick={() => handleApplyPreset('warm')}
            >
              🎙️ Warm Broadcast
            </button>
            <button
              type="button"
              className={`creator-quick-btn ${activePreset === 'radio' ? 'active-cyan' : ''}`}
              style={{ fontSize: '0.68rem', justifyContent: 'center' }}
              onClick={() => handleApplyPreset('radio')}
            >
              📻 Deep Radio
            </button>
            <button
              type="button"
              className={`creator-quick-btn ${activePreset === 'crisp' ? 'active-cyan' : ''}`}
              style={{ fontSize: '0.68rem', justifyContent: 'center' }}
              onClick={() => handleApplyPreset('crisp')}
            >
              🌬️ Crisp Air
            </button>
            <button
              type="button"
              className={`creator-quick-btn ${activePreset === 'gate' ? 'active-cyan' : ''}`}
              style={{ fontSize: '0.68rem', justifyContent: 'center' }}
              onClick={() => handleApplyPreset('gate')}
            >
              🔇 Strict Gate
            </button>
            <button
              type="button"
              className={`creator-quick-btn ${activePreset === 'flat' ? 'active-cyan' : ''}`}
              style={{ fontSize: '0.68rem', justifyContent: 'center' }}
              onClick={() => handleApplyPreset('flat')}
            >
              ⚖️ Flat Transparent
            </button>
          </div>
        </div>

        {/* DSP Rack Controls Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* SECTION 1: REAL-TIME NOISE GATE */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} /> ADAPTIVE SPECTRAL NOISE GATE
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  color: config.gateEnabled ? 'var(--accent-green)' : 'var(--text-muted)',
                  border: `1px solid ${config.gateEnabled ? 'rgba(0,255,135,0.4)' : 'var(--border-dim)'}`,
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}>
                  {config.gateEnabled ? 'GATE ACTIVE' : 'BYPASS'}
                </span>
                <button
                  type="button"
                  className={`btn-transport ${config.gateEnabled ? 'btn-cyan' : ''}`}
                  style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                  onClick={() => updateField('gateEnabled', !config.gateEnabled)}
                >
                  {config.gateEnabled ? 'DISABLE' : 'ENABLE'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>THRESHOLD (CUTOFF):</span>
                  <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{config.gateThresholdDb} dBFS</strong>
                </label>
                <input
                  type="range"
                  min="-80"
                  max="-15"
                  step="1"
                  disabled={!config.gateEnabled}
                  value={config.gateThresholdDb}
                  onChange={(e) => updateField('gateThresholdDb', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  <span>-80 dB (Gentle Room)</span>
                  <span>-15 dB (Heavy Background Noise)</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>RELEASE SMOOTHING:</span>
                  <strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{config.gateReleaseMs} ms</strong>
                </label>
                <input
                  type="range"
                  min="20"
                  max="300"
                  step="10"
                  disabled={!config.gateEnabled}
                  value={config.gateReleaseMs}
                  onChange={(e) => updateField('gateReleaseMs', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  <span>20 ms (Instant Cut)</span>
                  <span>300 ms (Vocal Tail Fade)</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: HIGH-PASS FILTER (LOW CUT) */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} /> HIGH-PASS FILTER (DESK RUMBLE & AIR-CON LOW CUT)
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-amber)' }}>
                {config.highPassFreq <= 0 ? 'BYPASSED' : `${config.highPassFreq} Hz`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[0, 40, 80, 100, 120, 160].map((freq) => (
                <button
                  key={freq}
                  type="button"
                  className={`btn-transport ${config.highPassFreq === freq ? 'btn-cyan' : ''}`}
                  style={{ flex: 1, padding: '4px', fontSize: '0.68rem' }}
                  onClick={() => updateField('highPassFreq', freq)}
                >
                  {freq === 0 ? 'OFF' : `${freq}Hz`}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 3: PARAMETRIC 3-BAND EQUALIZER */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-green)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} /> PARAMETRIC 3-BAND VOCAL EQUALIZER
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              {/* Band 1: Low Bass Shelf */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                  LOW BASS SHELF
                </div>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', margin: '4px 0 2px' }}>
                  <span>Gain:</span>
                  <strong style={{ color: config.eqLowGain !== 0 ? 'var(--accent-green)' : '#fff' }}>
                    {config.eqLowGain > 0 ? `+${config.eqLowGain}` : config.eqLowGain} dB
                  </strong>
                </label>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={config.eqLowGain}
                  onChange={(e) => updateField('eqLowGain', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-green)' }}
                />

                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', margin: '6px 0 2px' }}>
                  <span>Freq:</span>
                  <strong style={{ color: '#fff' }}>{config.eqLowFreq} Hz</strong>
                </label>
                <input
                  type="range"
                  min="60"
                  max="250"
                  step="5"
                  value={config.eqLowFreq}
                  onChange={(e) => updateField('eqLowFreq', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Band 2: Mid Presence Peaking */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-green)', marginBottom: '4px' }}>
                  MID PRESENCE (PEAK)
                </div>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', margin: '4px 0 2px' }}>
                  <span>Gain:</span>
                  <strong style={{ color: config.eqMidGain !== 0 ? 'var(--accent-green)' : '#fff' }}>
                    {config.eqMidGain > 0 ? `+${config.eqMidGain}` : config.eqMidGain} dB
                  </strong>
                </label>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={config.eqMidGain}
                  onChange={(e) => updateField('eqMidGain', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-green)' }}
                />

                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', margin: '6px 0 2px' }}>
                  <span>Freq:</span>
                  <strong style={{ color: '#fff' }}>{(config.eqMidFreq / 1000).toFixed(1)} kHz</strong>
                </label>
                <input
                  type="range"
                  min="400"
                  max="6000"
                  step="100"
                  value={config.eqMidFreq}
                  onChange={(e) => updateField('eqMidFreq', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Band 3: High Air Shelf */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '4px' }}>
                  HIGH AIR SHELF
                </div>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', margin: '4px 0 2px' }}>
                  <span>Gain:</span>
                  <strong style={{ color: config.eqHighGain !== 0 ? 'var(--accent-green)' : '#fff' }}>
                    {config.eqHighGain > 0 ? `+${config.eqHighGain}` : config.eqHighGain} dB
                  </strong>
                </label>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={config.eqHighGain}
                  onChange={(e) => updateField('eqHighGain', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-green)' }}
                />

                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', margin: '6px 0 2px' }}>
                  <span>Freq:</span>
                  <strong style={{ color: '#fff' }}>{(config.eqHighFreq / 1000).toFixed(1)} kHz</strong>
                </label>
                <input
                  type="range"
                  min="6000"
                  max="16000"
                  step="500"
                  value={config.eqHighFreq}
                  onChange={(e) => updateField('eqHighFreq', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: STUDIO COMPRESSOR & BRICKWALL LIMITER */}
          <div style={{ background: 'var(--bg-darker)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} /> DYNAMICS COMPRESSOR & BRICKWALL LIMITER
              </span>
              <button
                type="button"
                className={`btn-transport ${config.compEnabled ? 'btn-cyan' : ''}`}
                style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                onClick={() => updateField('compEnabled', !config.compEnabled)}
              >
                {config.compEnabled ? 'COMPRESSOR ON' : 'BYPASS'}
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  THRESHOLD: <strong style={{ color: '#fff' }}>{config.compThreshold} dBFS</strong>
                </label>
                <input
                  type="range"
                  min="-45"
                  max="0"
                  step="1"
                  disabled={!config.compEnabled}
                  value={config.compThreshold}
                  onChange={(e) => updateField('compThreshold', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
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

              <div>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  CEILING: <strong style={{ color: '#fff' }}>{config.limiterCeiling} dBFS</strong>
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
                <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  MASTER TRIM: <strong style={{ color: 'var(--accent-cyan)' }}>{config.masterGain.toFixed(2)}x</strong>
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
          <button type="button" className="btn-transport" onClick={handleReset}>
            <RotateCcw size={14} /> Reset Flat
          </button>
          <button type="button" className="btn-transport btn-cyan" onClick={onClose}>
            <CheckCircle size={14} /> Apply FX & Close Rack
          </button>
        </div>
      </div>
    </div>
  );
};

