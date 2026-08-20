import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, Music, Sparkles, Smile, Radio } from 'lucide-react';

interface SoundboardPanelProps {
  audioContext: AudioContext | null;
}

export const SoundboardPanel: React.FC<SoundboardPanelProps> = ({ audioContext }) => {
  const [activeSound, setActiveSound] = useState<string | null>(null);

  const getCtx = useCallback((): AudioContext => {
    if (audioContext && audioContext.state !== 'closed') return audioContext;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    return new AudioCtx();
  }, [audioContext]);

  // Web Audio Synthesized Sound Effects
  const playIntroJingle = useCallback(() => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    setActiveSound('intro');

    const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C4, E4, G4, C5, E5
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + index * 0.12;
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });

    setTimeout(() => setActiveSound((curr) => (curr === 'intro' ? null : curr)), 1200);
  }, [getCtx]);

  const playApplause = useCallback(() => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    setActiveSound('applause');

    const bufferSize = ctx.sampleRate * 2.5; // 2.5 sec noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    setTimeout(() => setActiveSound((curr) => (curr === 'applause' ? null : curr)), 2500);
  }, [getCtx]);

  const playLaughter = useCallback(() => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    setActiveSound('laughter');

    [0, 0.15, 0.3, 0.45, 0.6].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320 - idx * 25, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + delay + 0.12);

      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.12);
    });

    setTimeout(() => setActiveSound((curr) => (curr === 'laughter' ? null : curr)), 900);
  }, [getCtx]);

  const playOutroStinger = useCallback(() => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    setActiveSound('outro');

    const freqs = [523.25, 440.00, 349.23, 261.63]; // C5, A4, F4, C4
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.8);
    });

    setTimeout(() => setActiveSound((curr) => (curr === 'outro' ? null : curr)), 1500);
  }, [getCtx]);

  // Keyboard shortcut listener for keys 1 to 4
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === '1') playIntroJingle();
      else if (e.key === '2') playApplause();
      else if (e.key === '3') playLaughter();
      else if (e.key === '4') playOutroStinger();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playIntroJingle, playApplause, playLaughter, playOutroStinger]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Music size={13} color="var(--accent-cyan)" />
          <span>MPC STUDIO SOUNDBOARD & SFX PADS</span>
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>HOTKEYS: [1] [2] [3] [4]</span>
      </div>

      <div className="mpc-soundboard-grid">
        <button
          type="button"
          className={`mpc-pad-button ${activeSound === 'intro' ? 'is-active' : ''}`}
          onClick={playIntroJingle}
        >
          <span className="mpc-pad-key">1</span>
          <Sparkles size={18} color="var(--accent-cyan)" />
          <span className="mpc-pad-label">Intro Jingle</span>
        </button>

        <button
          type="button"
          className={`mpc-pad-button ${activeSound === 'applause' ? 'is-active' : ''}`}
          onClick={playApplause}
        >
          <span className="mpc-pad-key">2</span>
          <Volume2 size={18} color="var(--accent-green)" />
          <span className="mpc-pad-label">Applause</span>
        </button>

        <button
          type="button"
          className={`mpc-pad-button ${activeSound === 'laughter' ? 'is-active' : ''}`}
          onClick={playLaughter}
        >
          <span className="mpc-pad-key">3</span>
          <Smile size={18} color="var(--accent-amber)" />
          <span className="mpc-pad-label">Laughter</span>
        </button>

        <button
          type="button"
          className={`mpc-pad-button ${activeSound === 'outro' ? 'is-active' : ''}`}
          onClick={playOutroStinger}
        >
          <span className="mpc-pad-key">4</span>
          <Radio size={18} color="var(--accent-purple)" />
          <span className="mpc-pad-label">Outro Stinger</span>
        </button>
      </div>
    </div>
  );
};

