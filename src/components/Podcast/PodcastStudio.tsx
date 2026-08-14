import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Radio,
  Mic,
  Pause,
  Square,
  Download,
  Trash2,
  HelpCircle,
  LogOut,
  Activity,
  UserPlus,
  Lock,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { saveRecordingSession } from '../../auth/SessionStore';
import { saveSessionAudioBlobs } from '../../auth/CloudAudioStore';
import {
  getPendingRecoverySession,
  saveAutoSaveBackup,
  clearRecoverySession,
  type BackupSessionData,
} from '../../auth/AutoSaveRecoveryStore';
import { WebRTCAudioEngine, type WebRTCStatus } from '../../audio/WebRTCAudioEngine';
import { SpeakerAudioEngine, getAudioDevices, mergeToStereo, type DeviceInfo } from '../../audio/AudioEngine';
import type { AnalysisData } from '../../audio/AnalyserEngine';
import { SpeechToTextEngine, type TranscriptItem } from '../../audio/SpeechToTextEngine';
import { encodeWav } from '../../audio/encoders/WavEncoder';
import { SpeakerPanel } from './SpeakerPanel';
import { WaveformEditor } from '../Editor/WaveformEditor';
import { ExportModal } from '../Export/ExportModal';
import { ShortcutsModal } from '../Modals/ShortcutsModal';
import { GuestInviteModal } from './GuestInviteModal';
import { FxRackModal } from '../Modals/FxRackModal';
import { TranscriptPanel } from './TranscriptPanel';
import type { Marker } from '../Markers/MarkerList';
import { MarkerList } from '../Markers/MarkerList';
import { SoundboardPanel } from './SoundboardPanel';
import { getAutoUploadToDrive, uploadAudioBlobToDrive } from '../../auth/GoogleDriveUploader';

interface PodcastStudioProps {
  guestNameParam?: string;
  hostNameParam?: string;
}

export const PodcastStudio: React.FC<PodcastStudioProps> = ({ guestNameParam, hostNameParam }) => {
  const { currentUser, logout } = useAuth();

  const engineA = useRef<SpeakerAudioEngine | null>(null);
  const engineB = useRef<SpeakerAudioEngine | null>(null);

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [deviceA, setDeviceA] = useState('');
  const [_deviceB, _setDeviceB] = useState('');
  const [isConnectedA, setIsConnectedA] = useState(false);
  const [isConnectedB, setIsConnectedB] = useState(false);
  const [isMutedA, setIsMutedA] = useState(false);
  const [isMutedB, setIsMutedB] = useState(false);
  const [gainA, setGainA] = useState(1.0);
  const [_gainB, _setGainB] = useState(1.0);
  const [soloA, setSoloA] = useState(false);
  const [_soloB, setSoloB] = useState(false);
  const [vocalPresetA, setVocalPresetA] = useState('warm');

  const [analysisA, setAnalysisA] = useState<AnalysisData | null>(null);
  const [_analysisB, setAnalysisB] = useState<AnalysisData | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef(0);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [bufferA, setBufferA] = useState<AudioBuffer | null>(null);
  const [bufferB, setBufferB] = useState<AudioBuffer | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  const [showExport, setShowExport] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // WebRTC P2P & FX Rack State
  const [webrtcStatus, setWebrtcStatus] = useState<WebRTCStatus>({
    connected: false,
    role: currentUser?.role === 'user' ? 'guest' : 'host',
    remoteStream: null,
    statusText: 'Initializing P2P...',
  });
  const webrtcEngine = useRef<WebRTCAudioEngine | null>(null);
  const [activeFxEngine, setActiveFxEngine] = useState<SpeakerAudioEngine | null>(null);
  const [activeFxLabel, setActiveFxLabel] = useState<string>('');

  // AI Noise Suppression & Speech Transcripts & Recovery State
  const [isNoiseA, setIsNoiseA] = useState(true);
  const [_isNoiseB, _setIsNoiseB] = useState(true);
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en-US');
  const [recoveryData, setRecoveryData] = useState<BackupSessionData | null>(null);

  const sttEngine = useRef<SpeechToTextEngine | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const hostDisplayName = currentUser?.name || hostNameParam || 'Host Speaker';
  const guestDisplayName = guestNameParam || 'Guest Speaker';
  const hostDisplayNameRef = useRef(hostDisplayName);
  const guestDisplayNameRef = useRef(guestDisplayName);
  useEffect(() => {
    hostDisplayNameRef.current = hostDisplayName;
    guestDisplayNameRef.current = guestDisplayName;
  }, [hostDisplayName, guestDisplayName]);

  const isAdmin = currentUser?.role === 'admin';

  // Device Handlers
  const handleDeviceChangeA = useCallback(async (id: string) => {
    setDeviceA(id);
    if (id && engineA.current) {
      try {
        await engineA.current.startInputStream(id);
        setIsConnectedA(true);
        setMicPermissionError(null);
        const devs = await getAudioDevices();
        setDevices(devs);

        // Transmit host mic stream over WebRTC to guest speaker
        const hostStream = (engineA.current as any).stream as MediaStream | undefined;
        if (hostStream && webrtcEngine.current) {
          const audioTrack = hostStream.getAudioTracks()[0];
          if (audioTrack) {
            await webrtcEngine.current.replaceLocalTrack(audioTrack);
          } else {
            webrtcEngine.current.setLocalStream(hostStream);
          }
        }
      } catch (err: any) {
        setIsConnectedA(false);
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setMicPermissionError('Microphone access denied. Please allow microphone permissions in your browser settings and try again.');
        } else {
          setMicPermissionError(`Failed to connect microphone: ${err?.message || 'Unknown error'}`);
        }
      }
    }
  }, []);

  // Initialize Engines
  useEffect(() => {
    const eA = new SpeakerAudioEngine('Speaker A (Host)');
    const eB = new SpeakerAudioEngine('Speaker B (Guest)');
    engineA.current = eA;
    engineB.current = eB;

    const refreshDevices = async () => {
      try {
        const devs = await getAudioDevices();
        setDevices(devs);
        if (devs.length > 0) {
          setDeviceA((curr) => {
            if (!curr) {
              handleDeviceChangeA(devs[0].deviceId);
              return devs[0].deviceId;
            }
            return curr;
          });
        }
      } catch (err) {
        console.warn('Failed getting audio devices:', err);
      }
    };

    const setup = async () => {
      const ctx = await eA.init(undefined, 44100);
      await eB.init(ctx, 44100);
      await refreshDevices();
    };
    setup();

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    }

    // WebRTC Engine Init for Bi-Directional Call Audio
    const rRole = currentUser?.role === 'user' ? 'guest' : 'host';
    const rEngine = new WebRTCAudioEngine(rRole);
    rEngine.onStatusChange = (st) => setWebrtcStatus(st);
    rEngine.onRemoteStream = (remoteStream) => {
      // Connect remote guest stream into engineB for waveform visualizer & recording
      if (engineB.current) {
        engineB.current.startMediaStream(remoteStream);
        setIsConnectedB(true);
      }
      // Play remote guest voice live through host speakers/headphones
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch((e) => console.warn('Autoplay error:', e));
      }
    };
    webrtcEngine.current = rEngine;

    // Init Speech Recognition & Check Crash Recovery
    sttEngine.current = new SpeechToTextEngine();
    sttEngine.current.onTranscript = (item) => {
      setTranscriptItems((prev) => [...prev, item]);
    };

    getPendingRecoverySession().then((backup) => {
      if (backup && backup.elapsedMs > 2000) {
        setRecoveryData(backup);
      }
    });

    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      }
      eA.dispose();
      eB.dispose();
      rEngine.dispose();
      sttEngine.current?.stop();
    };
  }, [currentUser?.role, handleDeviceChangeA]);

  // Visualizer Loop
  useEffect(() => {
    let animId: number;
    const tick = () => {
      if (engineA.current) {
        const d = engineA.current.getAnalysis();
        if (d) setAnalysisA(d);
      }
      if (engineB.current) {
        const d = engineB.current.getAnalysis();
        if (d) setAnalysisB(d);
      }
      animId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Timer & Auto-Save Backup Loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let autoSaveInterval: ReturnType<typeof setInterval>;

    if (isRecording && !isPaused) {
      const startTime = Date.now() - elapsedRef.current;
      interval = setInterval(() => {
        elapsedRef.current = Date.now() - startTime;
        setElapsedMs(elapsedRef.current);
      }, 50);

      // Auto-save session backup every 5 seconds for crash recovery
      autoSaveInterval = setInterval(() => {
        saveAutoSaveBackup({
          id: 'active_session_backup',
          hostName: hostDisplayNameRef.current,
          guestName: guestDisplayNameRef.current,
          elapsedMs: elapsedRef.current,
          updatedAt: new Date().toISOString(),
          sampleRate: 44100,
        });
      }, 5000);
    }

    return () => {
      clearInterval(interval);
      clearInterval(autoSaveInterval);
    };
  }, [isRecording, isPaused]);

  // Recording Actions
  const handleStartRecord = useCallback(() => {
    if (!isConnectedA && !isConnectedB) {
      alert('Please select at least one microphone input device before starting the recording.');
      return;
    }
    engineA.current?.startRecording();
    engineB.current?.startRecording();
    elapsedRef.current = 0;
    setIsRecording(true);
    setIsPaused(false);

    // Start Live Speech-to-Text Engine
    sttEngine.current?.start(hostDisplayNameRef.current, 'host');
  }, [isConnectedA, isConnectedB]);

  const handlePause = useCallback(() => {
    if (isPaused) {
      engineA.current?.resumeRecording();
      engineB.current?.resumeRecording();
      setIsPaused(false);
    } else {
      engineA.current?.pauseRecording();
      engineB.current?.pauseRecording();
      setIsPaused(true);
    }
  }, [isPaused]);

  const handleStop = useCallback(() => {
    const bA = engineA.current?.stopRecording() || null;
    const bB = engineB.current?.stopRecording() || null;
    const finalDurationSeconds = Math.round(elapsedRef.current / 1000);

    setIsRecording(false);
    setIsPaused(false);
    setBufferA(bA);
    setBufferB(bB);

    let compiled: AudioBuffer | null = null;
    if (bA && bB && engineA.current?.audioContext) {
      compiled = mergeToStereo(engineA.current.audioContext, bA, bB);
    } else if (bA) {
      compiled = bA;
    } else if (bB) {
      compiled = bB;
    }

    sttEngine.current?.stop();
    clearRecoverySession();

    if (compiled) {
      setAudioBuffer(compiled);

      // Automatically log recording session to SessionStore for Admin Reports
      const savedSession = saveRecordingSession({
        hostId: currentUser?.id || 'usr_host',
        hostName: hostDisplayNameRef.current,
        hostEmail: currentUser?.email || 'host@studio.local',
        guestName: guestDisplayNameRef.current,
        title: `Podcast Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        durationSeconds: finalDurationSeconds || Math.round(compiled.duration),
        channelCount: compiled.numberOfChannels,
        format: 'WAV 32-bit Float',
      });

      // Save raw binary WAV blobs to CloudAudioStore (IndexedDB) for Admin Audio Stem Export
      try {
        const stereoBlob = encodeWav(compiled, 32);
        const blobA = bA ? encodeWav(bA, 32) : undefined;
        const blobB = bB ? encodeWav(bB, 32) : undefined;
        saveSessionAudioBlobs(savedSession.id, stereoBlob, blobA, blobB);

        // Auto-upload recorded audio directly to Google Drive folder if enabled
        if (getAutoUploadToDrive()) {
          const sanitized = savedSession.title.replace(/\s+/g, '_');
          uploadAudioBlobToDrive({
            blob: stereoBlob,
            fileName: `${sanitized}_${savedSession.id.slice(0, 8)}.wav`,
            sessionTitle: savedSession.title,
            hostName: savedSession.hostName,
            guestName: savedSession.guestName,
            durationSeconds: savedSession.durationSeconds,
          }).then((res) => {
            if (res.success && res.fileUrl) {
              console.log('✅ Session audio auto-uploaded to Google Drive:', res.fileUrl);
            }
          }).catch((e) => console.warn('Google Drive auto-upload failed:', e));
        }
      } catch (err) {
        console.error('Failed saving session audio blob:', err);
      }
    }
  }, [currentUser?.id, currentUser?.email]);

  const handleAddMarker = useCallback((time: number) => {
    setMarkers((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        time,
        label: `Cue ${prev.length + 1}`,
      },
    ]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ': // Space: Toggle Record/Pause
          e.preventDefault();
          if (isRecording) {
            handlePause();
          } else if (!isRecording && (isConnectedA || isConnectedB)) {
            handleStartRecord();
          }
          break;
        case 'r': // R: Start recording
        case 'R':
          if (!isRecording && (isConnectedA || isConnectedB)) {
            handleStartRecord();
          }
          break;
        case 's': // S: Stop recording
        case 'S':
          if (isRecording) {
            handleStop();
          }
          break;
        case 'm': // M: Add marker
        case 'M':
          if (isRecording) {
            handleAddMarker(elapsedRef.current / 1000);
          }
          break;
        case 'Escape': // Esc: Close modals
          setShowExport(false);
          setShowHelp(false);
          setShowInviteModal(false);
          setShowUserMenu(false);
          setShowTranscriptModal(false);
          setActiveFxEngine(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, isConnectedA, isConnectedB, handlePause, handleStartRecord, handleStop, handleAddMarker]);

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  const handleMuteA = () => {
    if (engineA.current) {
      const muted = engineA.current.toggleMute();
      setIsMutedA(muted);
    }
  };

  const handleMuteB = () => {
    if (engineB.current) {
      const muted = engineB.current.toggleMute();
      setIsMutedB(muted);
    }
  };

  const handleGainChangeA = (val: number) => {
    setGainA(val);
    engineA.current?.setGain(val);
  };

  const handlePresetChangeA = (preset: string) => {
    setVocalPresetA(preset);
    engineA.current?.applyVocalPreset(preset);
  };

  const handleToggleNoiseA = () => {
    const next = !isNoiseA;
    setIsNoiseA(next);
    engineA.current?.setNoiseSuppression(next);
  };

  const handleSoloA = () => {
    const next = !soloA;
    setSoloA(next);
    if (next) {
      setSoloB(false);
      if (!isMutedB) handleMuteB();
    }
  };

  const handleLanguageChange = (lang: string) => {
    setCurrentLanguage(lang);
    sttEngine.current?.setLanguage(lang);
  };

  const handleClear = () => {
    if (!window.confirm('Are you sure you want to clear this session? All unsaved audio will be permanently deleted.')) {
      return;
    }
    setAudioBuffer(null);
    setBufferA(null);
    setBufferB(null);
    setMarkers([]);
    elapsedRef.current = 0;
    setElapsedMs(0);
  };

  const hasAudio = audioBuffer !== null;

  return (
    <div className="daw-container">
      {/* Session Crash Recovery Banner */}
      {recoveryData && (
        <div style={{ background: 'linear-gradient(90deg, #ff2a5f, #ffb700)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>UNSAVED PODCAST SESSION RECOVERED ({Math.round(recoveryData.elapsedMs / 1000)}s recorded before unexpected exit)</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-transport"
              style={{ background: '#fff', color: '#000', padding: '2px 10px', height: 'auto', fontSize: '0.75rem', fontWeight: 700 }}
              onClick={() => {
                setElapsedMs(recoveryData.elapsedMs);
                elapsedRef.current = recoveryData.elapsedMs;
                setRecoveryData(null);
              }}
            >
              <RotateCcw size={12} /> Restore Session Clock
            </button>
            <button
              className="btn-transport"
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', padding: '2px 8px', height: 'auto', fontSize: '0.75rem' }}
              onClick={() => {
                clearRecoverySession();
                setRecoveryData(null);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {micPermissionError && (
        <div style={{ background: 'rgba(255, 42, 95, 0.15)', borderBottom: '1px solid rgba(255, 42, 95, 0.3)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--accent-red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{micPermissionError}</span>
          </div>
          <button
            className="btn-transport"
            style={{ padding: '2px 10px', height: 'auto', fontSize: '0.72rem' }}
            onClick={() => setMicPermissionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <header className="daw-header">
        <div className="daw-title-group">
          <Radio size={22} className="daw-logo-icon" />
          <h1 className="daw-title">PODCAST CRAFT STUDIO</h1>
          <span className="daw-badge">DUAL-CHANNEL DAW</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Invite Guest Button for Host */}
          <button
            className="btn-transport btn-cyan"
            onClick={() => setShowInviteModal(true)}
            style={{ height: '34px', padding: '0 14px' }}
          >
            <UserPlus size={14} /> Invite Guest Speaker
          </button>

          <div className="header-status-pill">
            <Activity size={13} color="var(--accent-cyan)" />
            <span>P2P WEBRTC: {webrtcStatus.connected ? 'LIVE CONNECTED' : webrtcStatus.statusText.toUpperCase()}</span>
          </div>

          {/* User Profile Menu */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn-transport"
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ gap: '8px', padding: '0 12px', height: '34px' }}
            >
              <div className="avatar-circle avatar-user" style={{ width: '22px', height: '22px', fontSize: '0.65rem' }}>
                {hostDisplayName.charAt(0).toUpperCase()}
              </div>
              <span>{hostDisplayName}</span>
            </button>

            {showUserMenu && (
              <div className="user-menu-dropdown">
                <div className="user-menu-info">
                  <div style={{ fontWeight: 600 }}>{hostDisplayName}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{currentUser?.email || 'Host Speaker'}</div>
                  <span className="role-badge role-admin" style={{ marginTop: '4px' }}>HOST SPEAKER</span>
                </div>
                <button className="user-menu-item user-menu-danger" onClick={logout}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Studio Console */}
      <main className="podcast-main">
        {/* Prominent Remote Guest Live Connection Status Bar */}
        <div style={{
          background: webrtcStatus.connected ? 'rgba(0, 255, 135, 0.08)' : 'rgba(255, 183, 0, 0.08)',
          border: `1px solid ${webrtcStatus.connected ? 'rgba(0, 255, 135, 0.35)' : 'rgba(255, 183, 0, 0.35)'}`,
          borderRadius: '8px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: webrtcStatus.connected ? 'var(--accent-green)' : 'var(--accent-amber)',
          boxShadow: webrtcStatus.connected ? '0 0 15px rgba(0, 255, 135, 0.15)' : 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: webrtcStatus.connected ? 'var(--accent-green)' : 'var(--accent-amber)',
              boxShadow: webrtcStatus.connected ? '0 0 10px var(--accent-green)' : '0 0 10px var(--accent-amber)',
              display: 'inline-block'
            }} />
            <span>
              {webrtcStatus.connected
                ? `GUEST CONNECTED LIVE — ${guestDisplayName.toUpperCase()} (P2P WEBRTC CALL ACTIVE)`
                : 'GUEST DISCONNECTED — WAITING FOR GUEST SPEAKER TO JOIN SESSION'}
            </span>
          </div>

          {!webrtcStatus.connected && (
            <button
              className="btn-transport btn-cyan"
              onClick={() => setShowInviteModal(true)}
              style={{ padding: '2px 12px', height: '28px', fontSize: '0.72rem' }}
            >
              <UserPlus size={13} /> Invite Guest Speaker
            </button>
          )}
        </div>

        {/* Top: Host Microphone Console Panel */}
        <section className="podcast-speakers" style={{ gridTemplateColumns: '1fr' }}>
          <SpeakerPanel
            label="SPEAKER A (HOST)"
            role="host"
            color="cyan"
            devices={devices}
            selectedDeviceId={deviceA}
            onDeviceChange={handleDeviceChangeA}
            isMuted={isMutedA}
            onToggleMute={handleMuteA}
            gain={gainA}
            onGainChange={handleGainChangeA}
            isSolo={soloA}
            onToggleSolo={handleSoloA}
            analysisData={analysisA}
            isRecording={isRecording}
            isConnected={isConnectedA}
            userName={hostDisplayName}
            onOpenFx={() => {
              setActiveFxEngine(engineA.current);
              setActiveFxLabel('Speaker A (Host)');
            }}
            isNoiseSuppressed={isNoiseA}
            onToggleNoiseSuppression={handleToggleNoiseA}
            vocalPreset={vocalPresetA}
            onPresetChange={handlePresetChangeA}
          />
        </section>

        {/* Studio Soundboard SFX Trigger Bar */}
        <SoundboardPanel audioContext={engineA.current?.audioContext || null} />

        {/* Center: Multi-track Waveform Timeline */}
        <section className="podcast-editor-area">
          <div style={{ flex: 1, minWidth: 0 }}>
            <WaveformEditor
              audioBuffer={audioBuffer}
              speakerABuffer={bufferA}
              speakerBBuffer={bufferB}
              onBufferUpdate={setAudioBuffer}
              onSpeakerBuffersUpdate={(a, b) => {
                setBufferA(a);
                setBufferB(b);
              }}
              onAddMarker={handleAddMarker}
            />
          </div>
          <div style={{ width: '260px', flexShrink: 0, minWidth: 0 }}>
            <MarkerList
              markers={markers}
              onDeleteMarker={(id) => setMarkers(markers.filter((m) => m.id !== id))}
              onJumpToMarker={() => {}}
            />
          </div>
        </section>

        {/* Bottom: Transport Controls */}
        <section className="transport-section">
          <div className="transport-btn-group">
            <button
              className={`btn-transport btn-rec ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? handleStop : handleStartRecord}
            >
              <Mic size={15} />
              {isRecording ? 'RECORDING LIVE' : 'RECORD PODCAST'}
            </button>

            {isRecording && (
              <button className="btn-transport" onClick={handlePause}>
                {isPaused ? <Mic size={15} /> : <Pause size={15} />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            )}

            {isRecording && (
              <button className="btn-transport" onClick={handleStop}>
                <Square size={15} /> Stop & Save Session
              </button>
            )}

            {hasAudio && !isRecording && (
              <button className="btn-transport" onClick={handleClear}>
                <Trash2 size={15} /> Clear Session
              </button>
            )}
          </div>

          <div className="time-display">{formatTime(elapsedMs)}</div>

          <div className="transport-btn-group">
            <button className="btn-transport" onClick={() => setShowTranscriptModal(true)}>
              <MessageSquare size={15} /> Live Transcripts ({transcriptItems.length})
            </button>
            <button className="btn-transport" onClick={() => setShowHelp(true)}>
              <HelpCircle size={15} /> Shortcuts
            </button>
            <button
              className={`btn-transport ${isAdmin ? 'btn-cyan' : ''}`}
              onClick={() => {
                if (!isAdmin) {
                  alert('🔒 EXPORT RESTRICTED: Only System Administrators have permission to export or download recorded audio files. Please contact your Admin to obtain exported WAV files.');
                  return;
                }
                setShowExport(true);
              }}
              disabled={!hasAudio || isRecording}
              title={!isAdmin ? 'Audio export is restricted to Admin only' : 'Export Podcast Audio'}
              style={{ opacity: !isAdmin ? 0.7 : 1 }}
            >
              {isAdmin ? <Download size={15} /> : <Lock size={15} color="var(--accent-amber)" />}
              {isAdmin ? 'Export Podcast' : 'Export (Admin Only)'}
            </button>
          </div>
        </section>
      </main>

      {/* Modals */}
      {showInviteModal && (
        <GuestInviteModal
          hostName={hostDisplayName}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {showExport && (
        <ExportModal
          audioBuffer={audioBuffer}
          speakerABuffer={bufferA}
          speakerBBuffer={bufferB}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHelp && <ShortcutsModal onClose={() => setShowHelp(false)} />}
      {activeFxEngine && (
        <FxRackModal
          engine={activeFxEngine}
          speakerLabel={activeFxLabel}
          onClose={() => setActiveFxEngine(null)}
        />
      )}
      {showTranscriptModal && (
        <TranscriptPanel
          items={transcriptItems}
          onClear={() => setTranscriptItems([])}
          onClose={() => setShowTranscriptModal(false)}
          currentLanguage={currentLanguage}
          onLanguageChange={handleLanguageChange}
        />
      )}

      {/* Hidden Live WebRTC Remote Guest Audio Element for Bi-Directional Call Playback */}
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
};
