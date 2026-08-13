import React from 'react';

interface VUMeterProps {
  peakDb: number;
  rmsDb: number;
  lufs: number;
  isClipping: boolean;
}

export const VUMeter: React.FC<VUMeterProps> = ({
  peakDb,
  rmsDb,
  lufs,
  isClipping,
}) => {
  // Normalize dBFS (-60 to +3) to percentage (0 to 100)
  const dbToPercent = (db: number) => {
    const minDb = -60;
    const maxDb = 3;
    const clamped = Math.max(minDb, Math.min(maxDb, db));
    return ((clamped - minDb) / (maxDb - minDb)) * 100;
  };

  const peakPercent = dbToPercent(peakDb);
  const rmsPercent = dbToPercent(rmsDb);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '8px',
        justifyContent: 'space-between',
        padding: '4px 0',
      }}
    >
      {/* Top Clip Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>METERING</span>
        <span
          style={{
            padding: '2px 6px',
            borderRadius: '3px',
            fontWeight: 700,
            background: isClipping ? '#ff2a5f' : 'rgba(255,255,255,0.05)',
            color: isClipping ? '#ffffff' : '#576574',
            boxShadow: isClipping ? '0 0 10px #ff2a5f' : 'none',
          }}
        >
          CLIP
        </span>
      </div>

      {/* Dual Meter Bars (L and R) */}
      <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'stretch' }}>
        {['L', 'R'].map((ch) => (
          <div
            key={ch}
            style={{
              flex: 1,
              background: '#0a0e17',
              borderRadius: '4px',
              border: '1px solid var(--border-dim)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              overflow: 'hidden',
            }}
          >
            {/* Peak Fill */}
            <div
              style={{
                height: `${peakPercent}%`,
                width: '100%',
                background:
                  'linear-gradient(to top, #00ff87 0%, #00f0ff 60%, #ffb700 85%, #ff2a5f 100%)',
                transition: 'height 0.05s ease-out',
              }}
            />
            {/* RMS Line Indicator */}
            <div
              style={{
                position: 'absolute',
                bottom: `${rmsPercent}%`,
                left: 0,
                right: 0,
                height: '2px',
                background: '#ffffff',
                boxShadow: '0 0 4px #ffffff',
              }}
            />
          </div>
        ))}
      </div>

      {/* Numerical Data Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
          background: 'var(--bg-darker)',
          padding: '4px 6px',
          borderRadius: '4px',
        }}
      >
        <div>
          PK: <span style={{ color: 'var(--accent-cyan)' }}>{peakDb.toFixed(1)} dB</span>
        </div>
        <div>
          LUFS: <span style={{ color: 'var(--accent-amber)' }}>{lufs.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};
