import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Crop,
  Volume2,
  Sliders,
  RotateCcw,
  Zap,
  BookmarkPlus,
  Play,
  Pause,
  Sparkles,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  sliceAudioBuffer,
  normalizeAudioBuffer,
  applyFade,
  reverseAudioBuffer,
  removeSilence,
} from '../../audio/AudioBufferUtils';

interface WaveformEditorProps {
  audioBuffer: AudioBuffer | null;
  speakerABuffer?: AudioBuffer | null;
  speakerBBuffer?: AudioBuffer | null;
  onBufferUpdate: (newBuffer: AudioBuffer) => void;
  onSpeakerBuffersUpdate?: (a: AudioBuffer | null, b: AudioBuffer | null) => void;
  onAddMarker: (time: number) => void;
  seekTime?: number;
}

interface HistoryEntry {
  audioBuffer: AudioBuffer;
  speakerABuffer: AudioBuffer | null;
  speakerBBuffer: AudioBuffer | null;
}

export const WaveformEditor: React.FC<WaveformEditorProps> = ({
  audioBuffer,
  speakerABuffer,
  speakerBBuffer,
  onBufferUpdate,
  onSpeakerBuffersUpdate,
  onAddMarker,
  seekTime,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);

  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [baseWidth, setBaseWidth] = useState<number>(800);
  const [zoom, setZoom] = useState<number>(1.0); // 1.0 to 8.0x

  // Jump playhead when external seekTime changes (e.g. from Transcript click)
  useEffect(() => {
    if (seekTime !== undefined && seekTime >= 0 && audioBuffer) {
      setCurrentTime(Math.min(audioBuffer.duration, seekTime));
    }
  }, [seekTime, audioBuffer]);


  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const effectiveWidth = Math.max(200, Math.round(baseWidth * zoom));

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  const editCtxRef = useRef<AudioContext | null>(null);
  const getEditCtx = (): AudioContext => {
    if (!editCtxRef.current || editCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      editCtxRef.current = new AudioCtx();
    }
    return editCtxRef.current;
  };

  useEffect(() => {
    return () => {
      if (editCtxRef.current && editCtxRef.current.state !== 'closed') {
        editCtxRef.current.close();
      }
    };
  }, []);

  const peaksCacheRef = useRef<{ 
    minA: Float32Array | null; maxA: Float32Array | null; 
    minB: Float32Array | null; maxB: Float32Array | null; 
    minMain: Float32Array | null; maxMain: Float32Array | null;
    width: number 
  }>({ minA: null, maxA: null, minB: null, maxB: null, minMain: null, maxMain: null, width: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;
    const width = effectiveWidth;
    
    const downsample = (buffer: AudioBuffer | null, channelIndex: number): { min: Float32Array, max: Float32Array } | null => {
      if (!buffer || channelIndex >= buffer.numberOfChannels) return null;
      const raw = buffer.getChannelData(channelIndex);
      const step = Math.ceil(raw.length / width);
      const minPeaks = new Float32Array(width);
      const maxPeaks = new Float32Array(width);
      
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        const start = i * step;
        const end = Math.min(start + step, raw.length);
        for (let j = start; j < end; j++) {
          const datum = raw[j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        minPeaks[i] = min;
        maxPeaks[i] = max;
      }
      return { min: minPeaks, max: maxPeaks };
    };
    
    const dsA = downsample(speakerABuffer || audioBuffer, 0);
    const dsB = downsample(speakerBBuffer || audioBuffer, (speakerBBuffer || audioBuffer.numberOfChannels > 1) ? (speakerBBuffer ? 0 : 1) : 0);
    const dsMain = downsample(audioBuffer, 0);
    
    peaksCacheRef.current = {
      minA: dsA ? dsA.min : null, maxA: dsA ? dsA.max : null,
      minB: dsB ? dsB.min : null, maxB: dsB ? dsB.max : null,
      minMain: dsMain ? dsMain.min : null, maxMain: dsMain ? dsMain.max : null,
      width
    };
  }, [audioBuffer, speakerABuffer, speakerBBuffer, effectiveWidth]);

  const duration = audioBuffer ? audioBuffer.duration : 0;

  // Auto-resize base width to match container width smoothly
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 28; // minus padding
        if (w > 200) setBaseWidth(w);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Multi-Track Waveform Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = effectiveWidth;
    const height = canvas.height;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Clear background
    ctx.fillStyle = isDark ? '#090d14' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Render Top Timeline Ruler Ticks
    ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
    ctx.fillStyle = '#64748b';
    ctx.font = '500 9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';

    const tickCount = Math.max(10, Math.round(10 * zoom));
    const step = width / tickCount;
    for (let i = 0; i <= tickCount; i++) {
      const tickX = i * step;
      const tickTime = (i / tickCount) * (duration || 60);
      const m = Math.floor(tickTime / 60);
      const s = Math.floor(tickTime % 60);
      const cs = Math.floor((tickTime % 1) * 10);
      const label = zoom > 2
        ? `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs}`
        : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

      ctx.beginPath();
      ctx.moveTo(tickX, 0);
      ctx.lineTo(tickX, 6);
      ctx.stroke();

      if (i < tickCount) {
        ctx.fillText(label, tickX + 3, 10);
      }
    }

    if (!audioBuffer) {
      // Empty Timeline visual
      ctx.fillStyle = isDark ? '#334155' : '#94a3b8';
      ctx.font = '500 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'DUAL-TRACK PODCAST TIMELINE IDLE — PRESS RECORD TO CAPTURE BOTH SPEAKERS IN STEREO ISOLATION',
        width / 2,
        height / 2
      );
      return;
    }

    const isDualTrack = audioBuffer.numberOfChannels >= 2 || (speakerABuffer && speakerBBuffer);
    const trackHeight = isDualTrack ? height / 2 : height;

    // Helper to draw single channel waveform
    const drawTrackWaveform = (
      minPeaks: Float32Array | null,
      maxPeaks: Float32Array | null,
      yOffset: number,
      tHeight: number,
      color: string,
      trackLabel: string
    ) => {
      // Gradient Track Background
      const bgGrad = ctx.createLinearGradient(0, yOffset, 0, yOffset + tHeight);
      if (isDark) {
        bgGrad.addColorStop(0, '#0e1420');
        bgGrad.addColorStop(1, '#070a12');
      } else {
        bgGrad.addColorStop(0, '#f8fafc');
        bgGrad.addColorStop(1, '#f1f5f9');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, yOffset, width, tHeight - 1);

      // Track Border
      ctx.strokeStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, yOffset, width, tHeight - 1);

      // Center Line
      const midY = yOffset + tHeight / 2;
      ctx.strokeStyle = isDark ? '#162032' : '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Track Label Badge
      ctx.fillStyle = color;
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(trackLabel, 10, yOffset + 14);

      if (!minPeaks || !maxPeaks) return;

      // Waveform Peaks
      const amp = tHeight / 2.2;

      ctx.save();
      ctx.shadowColor = isDark ? color : 'transparent';
      ctx.shadowBlur = isDark ? 6 : 0;
      ctx.fillStyle = color;

      for (let i = 0; i < width; i++) {
        const min = minPeaks[i];
        const max = maxPeaks[i];
        const barH = Math.max(1, (max - min) * amp);
        const barY = midY + min * amp;
        ctx.fillRect(i, barY, 1.2, barH);
      }
      ctx.restore();
    };

    const cyanColor = isDark ? '#00f0ff' : '#0284c7';
    const amberColor = isDark ? '#ffb700' : '#d97706';

    if (isDualTrack) {
      // Track 1: Speaker A / Channel L (Cyan)
      drawTrackWaveform(peaksCacheRef.current.minA, peaksCacheRef.current.maxA, 0, trackHeight, cyanColor, 'TRACK 1: SPEAKER A (HOST) — LEFT CHANNEL');

      // Track 2: Speaker B / Channel R (Amber)
      drawTrackWaveform(peaksCacheRef.current.minB, peaksCacheRef.current.maxB, trackHeight, trackHeight, amberColor, 'TRACK 2: SPEAKER B (GUEST) — RIGHT CHANNEL');
    } else {
      // Single Track Mode
      drawTrackWaveform(peaksCacheRef.current.minMain, peaksCacheRef.current.maxMain, 0, height, cyanColor, 'TRACK 1: MONO RECORDING');
    }

    // Draw Selection Highlight Overlay
    if (selection && duration > 0) {
      const startX = (selection.start / duration) * width;
      const endX = (selection.end / duration) * width;
      const selWidth = endX - startX;

      ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.fillRect(startX, 0, selWidth, height);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX, 0, selWidth, height);

      // Selection Time Badge
      ctx.fillStyle = '#00f0ff';
      ctx.font = '600 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const selDuration = (selection.end - selection.start).toFixed(2);
      ctx.fillText(`SEL: ${selDuration}s`, startX + selWidth / 2, height / 2);
    }

    // Draw Glowing Neon Playhead Marker
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;

      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Top Beacon Handle
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(playheadX, 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, [audioBuffer, speakerABuffer, speakerBBuffer, selection, currentTime, duration, effectiveWidth, zoom]);

  // Handle Playback
  const togglePlay = () => {
    if (!audioBuffer) return;

    if (isPlaying) {
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch { /* ignore */ }
      }
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      const ctx = getEditCtx();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startOffset = selection ? selection.start : currentTime;
      playStartTimeRef.current = ctx.currentTime - startOffset;

      source.start(0, startOffset);
      audioSourceRef.current = source;
      setIsPlaying(true);

      const updatePlayhead = () => {
        const elapsed = ctx.currentTime - playStartTimeRef.current;
        if (elapsed >= duration) {
          setIsPlaying(false);
          setCurrentTime(0);
        } else {
          setCurrentTime(elapsed);
          animFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      updatePlayhead();
    }
  };

  // Canvas Mouse Selection
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !duration) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTime = Math.max(0, Math.min(duration, (clickX / rect.width) * duration));

    setCurrentTime(clickedTime);
    setSelection({ start: clickedTime, end: clickedTime });
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !canvasRef.current || !duration || !selection) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const moveX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const moveTime = (moveX / rect.width) * duration;

    setSelection({
      start: Math.min(selection.start, moveTime),
      end: Math.max(selection.start, moveTime),
    });
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    if (selection && Math.abs(selection.end - selection.start) < 0.05) {
      setSelection(null);
    }
  };

  // History Helper: Push current state to undoStack
  const pushHistoryState = useCallback(() => {
    if (!audioBuffer) return;
    setUndoStack((prev) => [
      ...prev.slice(-19), // keep max 20 states
      {
        audioBuffer,
        speakerABuffer: speakerABuffer || null,
        speakerBBuffer: speakerBBuffer || null,
      },
    ]);
    setRedoStack([]);
  }, [audioBuffer, speakerABuffer, speakerBBuffer]);

  // Undo & Redo Handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !audioBuffer) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      {
        audioBuffer,
        speakerABuffer: speakerABuffer || null,
        speakerBBuffer: speakerBBuffer || null,
      },
    ]);

    onBufferUpdate(last.audioBuffer);
    if (onSpeakerBuffersUpdate) {
      onSpeakerBuffersUpdate(last.speakerABuffer, last.speakerBBuffer);
    }
    setSelection(null);
  }, [undoStack, audioBuffer, speakerABuffer, speakerBBuffer, onBufferUpdate, onSpeakerBuffersUpdate]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !audioBuffer) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      {
        audioBuffer,
        speakerABuffer: speakerABuffer || null,
        speakerBBuffer: speakerBBuffer || null,
      },
    ]);

    onBufferUpdate(next.audioBuffer);
    if (onSpeakerBuffersUpdate) {
      onSpeakerBuffersUpdate(next.speakerABuffer, next.speakerBBuffer);
    }
    setSelection(null);
  }, [redoStack, audioBuffer, speakerABuffer, speakerBBuffer, onBufferUpdate, onSpeakerBuffersUpdate]);

  // Keyboard Shortcuts for Undo/Redo (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlOrMeta) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // DSP Actions with Undo State Capture
  const handleTrim = () => {
    if (!audioBuffer || !selection || selection.end <= selection.start) return;
    pushHistoryState();
    const ctx = getEditCtx();
    const trimmed = sliceAudioBuffer(ctx, audioBuffer, selection.start, selection.end);
    onBufferUpdate(trimmed);
    if (onSpeakerBuffersUpdate) {
      const trimmedA = speakerABuffer ? sliceAudioBuffer(ctx, speakerABuffer, selection.start, selection.end) : null;
      const trimmedB = speakerBBuffer ? sliceAudioBuffer(ctx, speakerBBuffer, selection.start, selection.end) : null;
      onSpeakerBuffersUpdate(trimmedA, trimmedB);
    }
    setSelection(null);
    setCurrentTime(0);
  };

  const handleNormalize = () => {
    if (!audioBuffer) return;
    pushHistoryState();
    const ctx = getEditCtx();
    const normalized = normalizeAudioBuffer(ctx, audioBuffer, -1.0);
    onBufferUpdate(normalized);
    if (onSpeakerBuffersUpdate) {
      const normA = speakerABuffer ? normalizeAudioBuffer(ctx, speakerABuffer, -1.0) : null;
      const normB = speakerBBuffer ? normalizeAudioBuffer(ctx, speakerBBuffer, -1.0) : null;
      onSpeakerBuffersUpdate(normA, normB);
    }
  };

  const handleFade = () => {
    if (!audioBuffer) return;
    pushHistoryState();
    const ctx = getEditCtx();
    const faded = applyFade(ctx, audioBuffer, 0.5, 0.5);
    onBufferUpdate(faded);
    if (onSpeakerBuffersUpdate) {
      const fadedA = speakerABuffer ? applyFade(ctx, speakerABuffer, 0.5, 0.5) : null;
      const fadedB = speakerBBuffer ? applyFade(ctx, speakerBBuffer, 0.5, 0.5) : null;
      onSpeakerBuffersUpdate(fadedA, fadedB);
    }
  };

  const handleReverse = () => {
    if (!audioBuffer) return;
    pushHistoryState();
    const ctx = getEditCtx();
    const reversed = reverseAudioBuffer(ctx, audioBuffer);
    onBufferUpdate(reversed);
    if (onSpeakerBuffersUpdate) {
      const revA = speakerABuffer ? reverseAudioBuffer(ctx, speakerABuffer) : null;
      const revB = speakerBBuffer ? reverseAudioBuffer(ctx, speakerBBuffer) : null;
      onSpeakerBuffersUpdate(revA, revB);
    }
  };

  const handleRemoveSilence = () => {
    if (!audioBuffer) return;
    pushHistoryState();
    const ctx = getEditCtx();
    const cleaned = removeSilence(ctx, audioBuffer, -42, 0.3);
    onBufferUpdate(cleaned);
    if (onSpeakerBuffersUpdate) {
      const cleanA = speakerABuffer ? removeSilence(ctx, speakerABuffer, -42, 0.3) : null;
      const cleanB = speakerBBuffer ? removeSilence(ctx, speakerBBuffer, -42, 0.3) : null;
      onSpeakerBuffersUpdate(cleanA, cleanB);
    }
  };

  const handleMastering = () => {
    if (!audioBuffer) return;
    pushHistoryState();
    const ctx = getEditCtx();
    const mastered = normalizeAudioBuffer(ctx, audioBuffer, -0.5);
    onBufferUpdate(mastered);
    if (onSpeakerBuffersUpdate) {
      const mastA = speakerABuffer ? normalizeAudioBuffer(ctx, speakerABuffer, -0.5) : null;
      const mastB = speakerBBuffer ? normalizeAudioBuffer(ctx, speakerBBuffer, -0.5) : null;
      onSpeakerBuffersUpdate(mastA, mastB);
    }
  };

  return (
    <div className="card-panel editor-section" ref={containerRef}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={16} className="daw-logo-icon" />
          <span>MULTI-TRACK PODCAST WAVEFORM TIMELINE</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Undo / Redo Buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="btn-transport"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo Last Edit (Ctrl+Z)"
              style={{ padding: '2px 8px', height: '26px', fontSize: '0.7rem' }}
            >
              <Undo2 size={12} /> Undo
            </button>
            <button
              className="btn-transport"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              style={{ padding: '2px 8px', height: '26px', fontSize: '0.7rem' }}
            >
              <Redo2 size={12} /> Redo
            </button>
          </div>

          {/* Timeline Zoom Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            <ZoomOut
              size={13}
              style={{ cursor: 'pointer' }}
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
            />
            <input
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{ width: '60px', height: '4px' }}
              title={`Timeline Zoom: ${zoom}x`}
            />
            <ZoomIn
              size={13}
              style={{ cursor: 'pointer' }}
              onClick={() => setZoom((z) => Math.min(8, Number((z + 0.5).toFixed(1))))}
            />
            <span style={{ fontFamily: 'var(--font-mono)', minWidth: '24px' }}>{zoom}x</span>
          </div>

          <span className="tag">
            {duration > 0 ? `${duration.toFixed(2)}s | 2 TRACKS` : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Fluid Resizing Canvas with Horizontal Scroll for Zoom */}
      <div
        ref={scrollWrapperRef}
        className="canvas-wrapper"
        style={{ flex: 1, minHeight: '170px', margin: '6px 0', overflowX: 'auto', overflowY: 'hidden' }}
      >
        <canvas
          ref={canvasRef}
          className="visualizer-canvas"
          width={effectiveWidth}
          height={180}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: 'crosshair', width: `${effectiveWidth}px`, height: '180px', display: 'block' }}
        />
      </div>

      {/* Editing Controls Bar */}
      <div className="editor-controls-bar">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button className="btn-transport" onClick={togglePlay} disabled={!audioBuffer}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'Pause' : 'Play Audio'}
          </button>
          <button className="btn-transport" onClick={handleTrim} disabled={!selection} title="Trim Selection">
            <Crop size={14} /> Crop
          </button>
          <button className="btn-transport" onClick={handleNormalize} disabled={!audioBuffer} title="Normalize -1 dBFS">
            <Volume2 size={14} /> Normalize
          </button>
          <button className="btn-transport" onClick={handleFade} disabled={!audioBuffer} title="Fade In/Out">
            <Sliders size={14} /> Fades
          </button>
          <button className="btn-transport" onClick={handleReverse} disabled={!audioBuffer} title="Reverse Audio">
            <RotateCcw size={14} /> Reverse
          </button>
          <button className="btn-transport" onClick={handleRemoveSilence} disabled={!audioBuffer} title="Strip Silence">
            <Zap size={14} /> Strip Silence
          </button>
          <button className="btn-transport btn-cyan" onClick={handleMastering} disabled={!audioBuffer} title="1-Click Broadcast Mastering (-16 LUFS Target)">
            <Sparkles size={14} /> Master (-16 LUFS)
          </button>
        </div>

        <button
          className="btn-transport btn-cyan"
          onClick={() => onAddMarker(currentTime)}
          disabled={!audioBuffer}
        >
          <BookmarkPlus size={14} /> Add Cue Point
        </button>
      </div>
    </div>
  );
};
