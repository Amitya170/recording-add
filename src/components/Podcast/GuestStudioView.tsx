import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Radio,
  Activity,
  LogOut,
  HelpCircle,
  MessageSquare,
  AlertTriangle,
  Mic,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { WebRTCAudioEngine, type WebRTCStatus } from '../../audio/WebRTCAudioEngine';
import { SpeakerAudioEngine, getAudioDevices, type DeviceInfo } from '../../audio/AudioEngine';
import type { AnalysisData } from '../../audio/AnalyserEngine';
import { SpeechToTextEngine, type TranscriptItem } from '../../audio/SpeechToTextEngine';
import { SpeakerPanel } from './SpeakerPanel';
import { ShortcutsModal } from '../Modals/ShortcutsModal';
import { FxRackModal } from '../Modals/FxRackModal';
import { TranscriptPanel } from './TranscriptPanel';

interface GuestStudioViewProps {
  guestNameParam?: string;
  hostNameParam?: string;
  sessionToken?: string;
}

export const GuestStudioView: React.FC<GuestStudioViewProps> = ({ guestNameParam, hostNameParam: _hostNameParam, sessionToken }) => {
  const { currentUser, logout } = useAuth();

  const engineGuest = useRef<SpeakerAudioEngine | null>(null);
  const engineHostIncoming = useRef<SpeakerAudioEngine | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [gain, setGain] = useState(1.0);
  const [isSolo, setIsSolo] = useState(false);
  const [vocalPreset, setVocalPreset] = useState('warm');
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  const [analysisGuest, setAnalysisGuest] = useState<AnalysisData | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // WebRTC P2P State
  const [webrtcStatus, setWebrtcStatus] = useState<WebRTCStatus>({
    connected: false,
    role: 'guest',
    remoteStream: null,
    statusText: 'Connecting to Host...',
  });
  const webrtcEngine = useRef<WebRTCAudioEngine | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // FX & Noise Suppression State
  const [showFxModal, setShowFxModal] = useState(false);
  const [isNoiseSuppressed, setIsNoiseSuppressed] = useState(true);
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en-US');

  const sttEngine = useRef<SpeechToTextEngine | null>(null);

  const guestDisplayName = guestNameParam || currentUser?.name || 'Guest Speaker';

  const handleDeviceChange = useCallback(async (id: string) => {
    setSelectedDevice(id);
    setMicPermissionError(null);
    if (id && engineGuest.current) {
      try {
        await engineGuest.current.startInputStream(id);
        setIsConnected(true);

        // Transmit Guest mic stream to Host via WebRTC
        const stream = engineGuest.current.mediaStream;
        if (stream) {
          // webrtcEngine.current may still be null on very first auto-select;
          // we store the stream and the engine will pick it up on connect.
          if (webrtcEngine.current) {
            await webrtcEngine.current.setLocalStream(stream);
            console.log('[Guest] Local mic stream set on WebRTC engine');
          } else {
            // Engine not ready yet (first render race). Will be set after engine init.
            console.warn('[Guest] WebRTC engine not ready yet; stream will be set after init');
          }
        }
      } catch (err: any) {
        setIsConnected(false);
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setMicPermissionError('Microphone access denied. Please allow microphone permissions in your browser and try again.');
        } else if (err?.name === 'NotFoundError') {
          setMicPermissionError('No microphone found. Please connect a microphone and refresh the page.');
        } else {
          setMicPermissionError(`Failed to access microphone: ${err?.message || 'Unknown error'}`);
        }
        console.warn('Guest device change failed:', err);
      }
    }
  }, []);

  // Initialize Guest Engine & WebRTC
  useEffect(() => {
    // IMPORTANT: Create the WebRTC engine FIRST (synchronously) so it is
    // ready when handleDeviceChange fires from refreshDevices() below.
    const rEngine = new WebRTCAudioEngine('guest', sessionToken || 'podcast_main_session');
    rEngine.onStatusChange = (st) => setWebrtcStatus(st);
    rEngine.onRemoteStream = async (remoteStream) => {
      // PRIMARY playback path: audio element for reliable cross-browser playback
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.play().catch((e) => console.warn('Guest autoplay prevented:', e));
      }
      // SECONDARY: connect to engine for waveform metering only (no speaker output)
      if (engineHostIncoming.current) {
        await engineHostIncoming.current.startMediaStream(remoteStream);
      }
    };
    rEngine.onSignal = (sig: any) => {
      if (sig?.type === 'RECORDING_STATE') {
        if (sig.isRecording) {
          if (sig.isPaused) {
            engineGuest.current?.pauseRecording();
          } else {
            engineGuest.current?.startRecording();
          }
        } else {
          engineGuest.current?.stopRecording();
        }
      }
    };
    webrtcEngine.current = rEngine;

    // Guest own mic: no monitor. Host incoming: monitorOutput=false because we use
    // the audio element for playback (prevents double audio path causing noise/echo).
    const engine = new SpeakerAudioEngine('Guest Speaker', false);
    const eHost = new SpeakerAudioEngine('Host Speaker (Incoming)', false);
    engineGuest.current = engine;
    engineHostIncoming.current = eHost;

    const refreshDevices = async () => {
      try {
        const devs = await getAudioDevices();
        setDevices(devs);
        if (devs.length > 0) {
          setSelectedDevice((curr) => {
            if (!curr) {
              handleDeviceChange(devs[0].deviceId);
              return devs[0].deviceId;
            }
            return curr;
          });
        }
      } catch (err) {
        console.warn('Failed getting guest audio devices:', err);
      }
    };

    const setup = async () => {
      const ctx = await engine.init(undefined, 44100);
      await eHost.init(ctx, 44100);
      // Now engines are ready: refresh devices (will trigger mic selection)
      await refreshDevices();

      // If mic was already selected before engines were ready, retry stream attachment
      const existingStream = engine.mediaStream;
      if (existingStream && rEngine) {
        try {
          await rEngine.setLocalStream(existingStream);
          console.log('[Guest] Deferred local stream set on WebRTC engine after init');
        } catch (e) {
          console.warn('[Guest] Deferred setLocalStream failed:', e);
        }
      }
    };
    setup();

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    }

    // Live Speech Recognition
    sttEngine.current = new SpeechToTextEngine();
    sttEngine.current.onTranscript = (item) => {
      setTranscriptItems((prev) => [...prev, item]);
    };

    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      }
      engine.dispose();
      rEngine.dispose();
      sttEngine.current?.stop();
    };
  }, [handleDeviceChange, sessionToken]);

  // Visualizer Tick
  useEffect(() => {
    let animId: number;
    const tick = () => {
      if (engineGuest.current) {
        const d = engineGuest.current.getAnalysis();
        if (d) setAnalysisGuest(d);
      }
      animId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleMute = () => {
    if (engineGuest.current) {
      const muted = engineGuest.current.toggleMute();
      setIsMuted(muted);
    } else {
      setIsMuted((prev) => !prev);
    }
  };

  const handleGainChange = (val: number) => {
    setGain(val);
    engineGuest.current?.setGain(val);
  };

  const handlePresetChange = (preset: string) => {
    setVocalPreset(preset);
    engineGuest.current?.applyVocalPreset(preset);
  };

  const handleToggleNoise = () => {
    const next = !isNoiseSuppressed;
    setIsNoiseSuppressed(next);
    engineGuest.current?.setNoiseSuppression(next);
  };

  const handleLanguageChange = (lang: string) => {
    setCurrentLanguage(lang);
    sttEngine.current?.setLanguage(lang);
  };

  return (
    <div className="daw-container">
      {/* Header */}
      <header className="daw-header">
        <div className="daw-title-group">
          <Radio size={22} className="daw-logo-icon" color="var(--accent-amber)" />
          <h1 className="daw-title">PODCAST CRAFT STUDIO</h1>
          <span className="daw-badge" style={{ borderColor: 'var(--border-amber)', color: 'var(--accent-amber)', background: 'rgba(255,183,0,0.1)' }}>
            GUEST CONSOLE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="header-status-pill" style={{ borderColor: webrtcStatus.connected ? 'rgba(0,255,135,0.4)' : 'var(--border-dim)' }}>
            <Activity size={13} color={webrtcStatus.connected ? 'var(--accent-green)' : 'var(--accent-amber)'} />
            <span>P2P CALL: {webrtcStatus.connected ? 'CONNECTED TO HOST LIVE' : webrtcStatus.statusText.toUpperCase()}</span>
          </div>

          {/* User Profile Menu */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn-transport"
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ gap: '8px', padding: '0 12px', height: '34px' }}
            >
              <div className="avatar-circle avatar-user" style={{ width: '22px', height: '22px', fontSize: '0.65rem', background: 'rgba(255,183,0,0.2)', color: 'var(--accent-amber)' }}>
                {guestDisplayName.charAt(0).toUpperCase()}
              </div>
              <span>{guestDisplayName}</span>
            </button>

            {showUserMenu && (
              <div className="user-menu-dropdown">
                <div className="user-menu-info">
                  <div style={{ fontWeight: 600 }}>{guestDisplayName}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{currentUser?.email || 'Guest Speaker'}</div>
                  <span className="role-badge role-user" style={{ marginTop: '4px' }}>GUEST SPEAKER</span>
                </div>
                <button className="user-menu-item user-menu-danger" onClick={logout}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Guest Main Studio View */}
      <main className="podcast-main" style={{ justifyContent: 'center', alignItems: 'center', gap: '20px', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Prominent Host Connection Live Status Bar */}
          <div style={{
            background: webrtcStatus.connected ? 'rgba(0, 255, 135, 0.08)' : 'rgba(255, 183, 0, 0.08)',
            border: `1px solid ${webrtcStatus.connected ? 'rgba(0, 255, 135, 0.35)' : 'rgba(255, 183, 0, 0.35)'}`,
            borderRadius: '8px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: webrtcStatus.connected ? 'var(--accent-green)' : 'var(--accent-amber)',
            boxShadow: webrtcStatus.connected ? '0 0 15px rgba(0, 255, 135, 0.15)' : 'none'
          }}>
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
                ? 'CONNECTED TO HOST LIVE (P2P CALL ACTIVE — AUDIO STREAMING)'
                : 'CONNECTING TO HOST LIVE... (If the Host created a new invite link, please join using the newest link)'}
            </span>
          </div>

          {/* Mic Permission Error Banner */}
          {micPermissionError && (
            <div style={{
              background: 'rgba(255,42,95,0.1)',
              border: '1px solid rgba(255,42,95,0.5)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.82rem',
              color: '#ff2a5f',
              fontWeight: 600,
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{micPermissionError}</span>
              <button
                onClick={() => {
                  setMicPermissionError(null);
                  navigator.mediaDevices.getUserMedia({ audio: true })
                    .then((stream) => {
                      stream.getTracks().forEach(t => t.stop());
                      // Retry device selection after permission granted
                      if (selectedDevice) handleDeviceChange(selectedDevice);
                    })
                    .catch(() => setMicPermissionError('Microphone access still denied. Check your browser settings.'));
                }}
                style={{ background: 'rgba(255,42,95,0.15)', border: '1px solid rgba(255,42,95,0.5)', borderRadius: '6px', color: '#ff2a5f', cursor: 'pointer', padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
              >
                <Mic size={12} /> Grant Access
              </button>
            </div>
          )}

          {/* Full Width Guest Speaker Mic Control Panel */}
          <SpeakerPanel
            label="YOUR MICROPHONE (GUEST)"
            role="guest"
            color="amber"
            devices={devices}
            selectedDeviceId={selectedDevice}
            onDeviceChange={handleDeviceChange}
            isMuted={isMuted}
            onToggleMute={handleMute}
            gain={gain}
            onGainChange={handleGainChange}
            isSolo={isSolo}
            onToggleSolo={() => setIsSolo(!isSolo)}
            analysisData={analysisGuest}
            isRecording={webrtcStatus.connected}
            isConnected={isConnected}
            userName={guestDisplayName}
            onOpenFx={() => setShowFxModal(true)}
            isNoiseSuppressed={isNoiseSuppressed}
            onToggleNoiseSuppression={handleToggleNoise}
            vocalPreset={vocalPreset}
            onPresetChange={handlePresetChange}
          />

          {/* Footer Action Bar */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button className="btn-transport" onClick={() => setShowTranscriptModal(true)}>
              <MessageSquare size={14} /> Live Transcripts ({transcriptItems.length})
            </button>
            <button className="btn-transport" onClick={() => setShowHelp(true)}>
              <HelpCircle size={14} /> Shortcuts
            </button>
          </div>
        </div>
      </main>

      {/* Hidden Live WebRTC Remote Host Audio Element */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />

      {/* Modals */}
      {showHelp && <ShortcutsModal onClose={() => setShowHelp(false)} />}
      {showFxModal && engineGuest.current && (
        <FxRackModal
          engine={engineGuest.current}
          speakerLabel="Your Guest Microphone"
          onClose={() => setShowFxModal(false)}
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
    </div>
  );
};

