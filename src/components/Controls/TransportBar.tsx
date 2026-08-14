import React, { useEffect, useState } from 'react';
import { Play, Pause, Square, Mic, Download, Trash2, HelpCircle } from 'lucide-react';

interface TransportBarProps {
  isRecording: boolean;
  isPaused: boolean;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onStopRecord: () => void;
  onClear: () => void;
  onOpenExport: () => void;
  onOpenHelp: () => void;
  hasAudio: boolean;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isRecording,
  isPaused,
  onStartRecord,
  onPauseRecord,
  onStopRecord,
  onClear,
  onOpenExport,
  onOpenHelp,
  hasAudio,
}) => {
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const elapsedRef = React.useRef(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isPaused) {
      const startTime = Date.now() - elapsedRef.current;
      interval = setInterval(() => {
        elapsedRef.current = Date.now() - startTime;
        setElapsedMs(elapsedRef.current);
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Format Elapsed Time HH:MM:SS.ms
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const milli = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${milli.toString().padStart(2, '0')}`;
  };

  const handleRecordClick = () => {
    if (!isRecording) {
      elapsedRef.current = 0;
      setElapsedMs(0);
      onStartRecord();
    } else {
      onStopRecord();
    }
  };

  const handleClearClick = () => {
    elapsedRef.current = 0;
    setElapsedMs(0);
    onClear();
  };

  return (
    <div className="transport-section">
      {/* Left Action Controls */}
      <div className="transport-btn-group">
        <button
          className={`btn-transport btn-rec ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordClick}
        >
          <Mic size={16} />
          {isRecording ? 'RECORDING' : 'RECORD'}
        </button>

        {isRecording && (
          <button className="btn-transport" onClick={onPauseRecord}>
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        )}

        {isRecording && (
          <button className="btn-transport" onClick={onStopRecord}>
            <Square size={16} /> Stop & Compile
          </button>
        )}

        {hasAudio && !isRecording && (
          <button className="btn-transport" onClick={handleClearClick} title="Discard Recording">
            <Trash2 size={16} /> Discard
          </button>
        )}
      </div>

      {/* Center Studio Clock */}
      <div className="time-display">{formatTime(elapsedMs)}</div>

      {/* Right Actions */}
      <div className="transport-btn-group">
        <button className="btn-transport" onClick={onOpenHelp} title="Keyboard Shortcuts">
          <HelpCircle size={16} /> Shortcuts
        </button>
        <button
          className="btn-transport btn-cyan"
          onClick={onOpenExport}
          disabled={!hasAudio || isRecording}
        >
          <Download size={16} /> Export Audio
        </button>
      </div>
    </div>
  );
};
