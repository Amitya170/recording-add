import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Radio,
  Activity,
  LogOut,
  HelpCircle,
  MessageSquare,
  AlertTriangle,
  Mic,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { isSessionTokenRevoked } from '../../auth/SessionStore';
import { WebRTCAudioEngine, type WebRTCStatus } from '../../audio/WebRTCAudioEngine';
import { SpeakerAudioEngine, getAudioDevices, type DeviceInfo } from '../../audio/AudioEngine';
import type { AnalysisData } from '../../audio/AnalyserEngine';
import { SpeechToTextEngine, type TranscriptItem } from '../../audio/SpeechToTextEngine';
import { SpeakerPanel } from './SpeakerPanel';
import { ShortcutsModal } from '../Modals/ShortcutsModal';
import { FxRackModal } from '../Modals/FxRackModal';
import { TranscriptPanel } from './TranscriptPanel';
import { ThemeToggle } from '../Common/ThemeToggle';

interface GuestStudioViewProps {
  guestNameParam?: string;
  hostNameParam?: string;
  sessionToken?: string;
}

export const GuestStudioView: React.FC<GuestStudioViewProps> = ({ guestNameParam, hostNameParam: _hostNameParam, sessionToken }) => {
  const { currentUser, logout } = useAuth();
  const [pastedLink, setPastedLink] = useState('');

  const isRevoked = sessionToken ? isSessionTokenRevoked(sessionToken) : false;

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
    rEngine.onStatusChange = (st) => {
      setWebrtcStatus(st);
      if (st.connected && engineGuest.current?.mediaStream) {
        rEngine.setLocalStream(engineGuest.current.mediaStream).catch(() => {});
      }
    };
    rEngine.onRemoteStream = async (remoteStream) => {
      console.log('[GuestStudio] Received host remote stream:', remoteStream.id, 'tracks:', remoteStream.getAudioTracks().length);
      remoteStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });

      // 1. Attach to audio element for hardware Opus decoding
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.muted = false;
        try {
          await remoteAudioRef.current.play();
          console.log('[GuestStudio] Host audio playback started');
        } catch (e) {
          console.warn('[GuestStudio] Autoplay waiting for click interaction:', e);
        }
      }

      // 2. Connect to engine for live waveform metering & visualizer
      if (engineHostIncoming.current) {
        if (remoteAudioRef.current) {
          try {
            await engineHostIncoming.current.startMediaElementSource(remoteAudioRef.current);
          } catch {
            await engineHostIncoming.current.startMediaStream(remoteStream);
          }
        } else {
          await engineHostIncoming.current.startMediaStream(remoteStream);
        }
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

    // Guest own mic: no monitor (prevents hearing own voice).
    // Host incoming: remoteAudioRef handles playback directly to prevent AEC echo cancellation suppression.
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
      // Force 48000Hz (48kHz) to strictly match WebRTC Opus codec standard.
      const ctx = await engine.init(undefined, 48000);
      await eHost.init(ctx, 48000);
      await refreshDevices();

      const existingStream = engine.mediaStream;
      if (existingStream && rEngine) {
        try {
          await rEngine.setLocalStream(existingStream);
          console.log('[Guest] Local stream attached to WebRTC');
        } catch (e) {
          console.warn('[Guest] setLocalStream failed:', e);
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

  // Global interaction audio unlocker (required for Mobile iOS Safari & Android Chrome)
  useEffect(() => {
    const unlockAllAudio = async () => {
      // 1. Resume AudioContexts if suspended by mobile browser power-saver
      if (engineGuest.current?.audioContext?.state === 'suspended') {
        try { await engineGuest.current.audioContext.resume(); } catch {}
      }
      if (engineHostIncoming.current?.audioContext?.state === 'suspended') {
        try { await engineHostIncoming.current.audioContext.resume(); } catch {}
      }
      // 2. Play remote audio element
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
        try { await remoteAudioRef.current.play(); } catch {}
      }
    };
    window.addEventListener('click', unlockAllAudio);
    window.addEventListener('touchstart', unlockAllAudio);
    window.addEventListener('keydown', unlockAllAudio);
    return () => {
      window.removeEventListener('click', unlockAllAudio);
      window.removeEventListener('touchstart', unlockAllAudio);
      window.removeEventListener('keydown', unlockAllAudio);
    };
  }, []);

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

  if (isRevoked) {
    return (
      <div className="daw-root-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', background: 'var(--bg-dark)' }}>
        <div className="modal-card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '32px', border: '1px solid rgba(255, 59, 48, 0.3)', background: 'var(--bg-card)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255, 59, 48, 0.15)', border: '1px solid rgba(255, 59, 48, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={32} color="var(--accent-red)" />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px', color: 'var(--accent-red)' }}>
            RECORDING SESSION LINK EXPIRED
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.5' }}>
            The host has invalidated this recording session link and generated a new link. You cannot join or record with this expired link.
          </p>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: '8px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              HAVE A NEW INVITE LINK? PASTE IT TO JOIN:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="daw-input"
                value={pastedLink}
                onChange={(e) => setPastedLink(e.target.value)}
                placeholder="Paste new invite link here..."
                style={{ flex: 1, fontSize: '0.8rem' }}
              />
              <button
                className="btn-transport btn-cyan"
                onClick={() => {
                  if (pastedLink.trim()) {
                    window.location.href = pastedLink.trim();
                  }
                }}
              >
                Join
              </button>
            </div>
          </div>
          <button
            className="btn-transport"
            onClick={() => { window.location.href = window.location.origin; }}
            style={{ width: '100%' }}
          >
            Return to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="daw-container">
      {/* Header */}
      <header className="daw-header">
        <div className="daw-title-group">
          <Radio size={22} className="daw-logo-icon" color="var(--accent-amber)" />
          <h1 className="daw-title">PODCAST CRAFT STUDIO</h1>
          <span className="daw-badge" style={{ borderColor: 'var(--border-amber)', color: 'var(--accent-amber)', background: 'rgba(255,183,0,0.1)' }}>
            GUEST CREATOR CONSOLE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ThemeToggle />

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
      <main className="podcast-main" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        {/* Prominent Host Connection Live Status Bar */}
        <div style={{
          background: webrtcStatus.connected ? 'rgba(0, 255, 135, 0.08)' : 'rgba(255, 183, 0, 0.08)',
          border: `1px solid ${webrtcStatus.connected ? 'rgba(0, 255, 135, 0.35)' : 'rgba(255, 183, 0, 0.35)'}`,
          borderRadius: '10px',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.82rem',
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
                ? 'CONNECTED TO HOST LIVE (P2P CALL ACTIVE — AUDIO STREAMING)'
                : 'CONNECTING TO HOST LIVE... (Waiting for Host session to start)'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!webrtcStatus.connected && (
              <button
                className="creator-quick-btn"
                onClick={() => webrtcEngine.current?.retryConnection()}
                style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }}
                title="Force retry connection"
              >
                <RefreshCw size={13} /> Reconnect Now
              </button>
            )}
            <button className="creator-quick-btn" onClick={() => setShowTranscriptModal(true)}>
              <MessageSquare size={13} /> Captions ({transcriptItems.length})
            </button>
            <button className="creator-quick-btn" onClick={() => setShowHelp(true)}>
              <HelpCircle size={13} /> Shortcuts
            </button>
          </div>
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

        {/* Split Grid for Guest: Guest Mic Card (Left) & Live Synced Captions (Right) */}
        <div className="creator-workspace-split">
          {/* Guest Mic Card */}
          <div className="creator-workspace-pane">
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
          </div>

          {/* Live Synced Transcript & Closed Captions Pane */}
          <div className="creator-workspace-pane">
            <TranscriptPanel
              embedded={true}
              items={transcriptItems}
              onClear={() => setTranscriptItems([])}
              currentLanguage={currentLanguage}
              onLanguageChange={handleLanguageChange}
            />
          </div>
        </div>
      </main>

      {/* Live WebRTC Remote Host Audio Element (Mobile WebKit & Safari safe) */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: 0.01,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
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


