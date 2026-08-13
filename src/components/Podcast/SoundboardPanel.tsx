import React, { useState } from 'react';
import { Volume2, Music, Sparkles, Smile, Radio } from 'lucide-react';

interface SoundboardPanelProps {
  audioContext: AudioContext | null;
}

export const SoundboardPanel: React.FC<SoundboardPanelProps> = ({ audioContext }) => {
  const [activeSound, setActiveSound] = useState<string | null>(null);

  const getCtx = (): AudioContext => {
    if (audioContext && audioContext.state !== 'closed') return audioContext;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    return new AudioCtx();
  };

  // Web Audio Synthesized Sound Effects (No external files needed)
  const playIntroJingle = () => {
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

    setTimeout(() => setActiveSound(null), 1200);
  };

  const playApplause = () => {
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
    setTimeout(() => setActiveSound(null), 2500);
  };

  const playLaughter = () => {
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

    setTimeout(() => setActiveSound(null), 900);
  };

  const playOutroStinger = () => {
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

    setTimeout(() => setActiveSound(null), 1500);
  };

  return (
    <div className="card-panel" style={{ gap: '8px' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Music size={14} color="var(--accent-cyan)" />
          <span>STUDIO SOUNDBOARD & SFX</span>
        </div>
        <span className="tag">WEB AUDIO SYNTH</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        <button
          className={`btn-transport ${activeSound === 'intro' ? 'btn-cyan' : ''}`}
          onClick={playIntroJingle}
          style={{ justifyContent: 'center', fontSize: '0.72rem', height: '32px' }}
        >
          <Sparkles size={12} color="var(--accent-cyan)" /> Intro Jingle
        </button>

        <button
          className={`btn-transport ${activeSound === 'applause' ? 'btn-cyan' : ''}`}
          onClick={playApplause}
          style={{ justifyContent: 'center', fontSize: '0.72rem', height: '32px' }}
        >
          <Volume2 size={12} color="var(--accent-green)" /> Applause
        </button>

        <button
          className={`btn-transport ${activeSound === 'laughter' ? 'btn-cyan' : ''}`}
          onClick={playLaughter}
          style={{ justifyContent: 'center', fontSize: '0.72rem', height: '32px' }}
        >
          <Smile size={12} color="var(--accent-amber)" /> Laughter SFX
        </button>

        <button
          className={`btn-transport ${activeSound === 'outro' ? 'btn-cyan' : ''}`}
          onClick={playOutroStinger}
          style={{ justifyContent: 'center', fontSize: '0.72rem', height: '32px' }}
        >
          <Radio size={12} color="var(--accent-purple)" /> Outro Stinger
        </button>
      </div>
    </div>
  );
};
