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
  AlertTriangle,
  RotateCcw,
  Cloud,
  CloudUpload,
  Loader2,
  X,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { saveRecordingSession, updateSessionDriveStatus, getActiveHostSessionToken } from '../../auth/SessionStore';
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
import { analyzeAudioBuffer } from '../../audio/AcousticAnalyzer';
import { SpeakerPanel } from './SpeakerPanel';
import { WaveformEditor } from '../Editor/WaveformEditor';
import { ExportModal } from '../Export/ExportModal';
import { ShortcutsModal } from '../Modals/ShortcutsModal';
import { GuestInviteModal } from './GuestInviteModal';
import { FxRackModal } from '../Modals/FxRackModal';
import { TranscriptPanel } from './TranscriptPanel';
import { ThemeToggle } from '../Common/ThemeToggle';
import type { Marker } from '../Markers/MarkerList';
import { MarkerList } from '../Markers/MarkerList';
import { SoundboardPanel } from './SoundboardPanel';
import {
  getAutoUploadToDrive,
  uploadAudioBlobToDrive,
  getGoogleDriveWebhookUrl,
} from '../../auth/GoogleDriveUploader';
import { DriveUploadNotificationModal } from '../Modals/DriveUploadNotificationModal';

interface PodcastStudioProps {
  guestNameParam?: string;
  hostNameParam?: string;
  sessionToken?: string;
}

export const PodcastStudio: React.FC<PodcastStudioProps> = ({ guestNameParam, hostNameParam, sessionToken }) => {
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
  const [gainB, setGainB] = useState(1.0);
  const [soloA, setSoloA] = useState(false);
  const [soloB, setSoloB] = useState(false);
  const [vocalPresetA, setVocalPresetA] = useState('warm');
  const [vocalPresetB, setVocalPresetB] = useState('warm');

  const [analysisA, setAnalysisA] = useState<AnalysisData | null>(null);
  const [analysisB, setAnalysisB] = useState<AnalysisData | null>(null);

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

  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Google Drive Live Upload Progress State
  const [driveUpload, setDriveUpload] = useState<{
    isUploading: boolean;
    progress: number;
    stageText: string;
    fileUrl?: string;
    error?: string;
    sessionTitle?: string;
  } | null>(null);

  // Popup Modal for Upload Success / Error Notifications
  const [uploadModalPopup, setUploadModalPopup] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    fileUrl?: string;
    error?: string;
    sessionTitle?: string;
  } | null>(null);

  const [isWebhookConfigured, setIsWebhookConfigured] = useState(Boolean(getGoogleDriveWebhookUrl()));

  // Unique Studio WebRTC Session Room Token (persistent per host session unless rotated)
  const [studioSessionToken, setStudioSessionToken] = useState<string>(() => {
    if (sessionToken && sessionToken !== 'podcast_main_session') {
      return sessionToken;
    }
    const hostKey = currentUser?.id || currentUser?.name || 'host';
    return getActiveHostSessionToken(hostKey);
  });

  // Sync studioSessionToken with URL search params so page refresh preserves active room
  useEffect(() => {
    if (studioSessionToken && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('session') !== studioSessionToken) {
        url.searchParams.set('session', studioSessionToken);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [studioSessionToken]);

  // Global interaction audio unlocker (required for Mobile iOS Safari & Android Chrome)
  useEffect(() => {
    const unlockAllAudio = async () => {
      // 1. Resume AudioContexts if suspended by browser
      if (engineA.current?.audioContext?.state === 'suspended') {
        try { await engineA.current.audioContext.resume(); } catch {}
      }
      if (engineB.current?.audioContext?.state === 'suspended') {
        try { await engineB.current.audioContext.resume(); } catch {}
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

  useEffect(() => {
    const checkWebhook = () => {
      setIsWebhookConfigured(Boolean(getGoogleDriveWebhookUrl()));
    };
    window.addEventListener('storage', checkWebhook);
    const interval = setInterval(checkWebhook, 2000);
    return () => {
      window.removeEventListener('storage', checkWebhook);
      clearInterval(interval);
    };
  }, []);

  // WebRTC P2P & FX Rack State
  const [webrtcStatus, setWebrtcStatus] = useState<WebRTCStatus>({
    connected: false,
    role: currentUser?.role === 'user' ? 'guest' : 'host',
    remoteStream: null,
    statusText: 'Initializing P2P...',
  });
  const webrtcEngine = useRef<WebRTCAudioEngine | null>(null);
  const [activeFxEngine, setActiveFxEngine] = useState<SpeakerAudioEngine | null>(null);
  const [activeFxLabel, setActiveFxLabel] = useState('Speaker A (Host)');

  // AI Noise Suppression & Speech Transcripts & Recovery State
  const [isNoiseA, setIsNoiseA] = useState(true);
  const [isNoiseB, setIsNoiseB] = useState(true);
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en-US');
  const [recoveryData, setRecoveryData] = useState<BackupSessionData | null>(null);

  // Modern Creator Suite Split Workspace & Playhead Sync
  const [seekTargetTime, setSeekTargetTime] = useState<number | undefined>(undefined);
  const [activeRightTab, setActiveRightTab] = useState<'soundboard' | 'markers'>('soundboard');

  const sttEngine = useRef<SpeechToTextEngine | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const hostDisplayName = hostNameParam || (currentUser?.role === 'user' ? 'Host Speaker' : currentUser?.name || 'Host Speaker');
  const guestDisplayName = guestNameParam || (currentUser?.role === 'user' ? currentUser?.name : 'Guest Speaker');
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
        const hostStream = engineA.current.mediaStream;
        if (hostStream && webrtcEngine.current) {
          await webrtcEngine.current.setLocalStream(hostStream);
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
    // IMPORTANT: Create WebRTC engine FIRST (synchronously) so it is ready
    // when handleDeviceChangeA fires from refreshDevices() below.
    const rRole = currentUser?.role === 'user' ? 'guest' : 'host';
    const rEngine = new WebRTCAudioEngine(rRole, studioSessionToken);
    rEngine.onStatusChange = (st) => {
      setWebrtcStatus(st);
      if (st.connected) {
        setIsConnectedB(true);
      }
    };
    rEngine.onRemoteStream = async (remoteStream) => {
      console.log('[Host] Remote guest stream attached, tracks:', remoteStream.getAudioTracks().length);
      // PRIMARY playback path: audio element (lowest latency, direct headphone output)
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.oncanplay = () => {
          remoteAudioRef.current?.play().catch((e) => console.warn('[Host] oncanplay play error:', e));
        };
        try {
          await remoteAudioRef.current.play();
          console.log('[Host] Remote guest audio playback started successfully');
        } catch (e) {
          console.warn('[Host] Remote audio playback autoplay prevented:', e);
        }
      }
      // SECONDARY path: engine for waveform visualizer & PCM recording only (no speaker output)
      if (engineB.current) {
        await engineB.current.startMediaStream(remoteStream);
        setIsConnectedB(true);
        if (isRecordingRef.current) {
          engineB.current.startRecording();
        }
      }
    };
    webrtcEngine.current = rEngine;

    // Host mic: no self monitor. Guest incoming: monitorOutput=false because we use
    // the audio element for playback (prevents double audio path causing noise/echo).
    const eA = new SpeakerAudioEngine('Speaker A (Host)', false);
    const eB = new SpeakerAudioEngine('Speaker B (Guest)', false);
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

      // If mic was auto-selected before engines were ready, retry stream attachment
      const existingStream = eA.mediaStream;
      if (existingStream && rEngine) {
        try {
          await rEngine.setLocalStream(existingStream);
          console.log('[Host] Deferred local stream set on WebRTC engine after init');
        } catch (e) {
          console.warn('[Host] Deferred setLocalStream failed:', e);
        }
      }
    };
    setup();

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    }

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
  }, [currentUser?.role, handleDeviceChangeA, studioSessionToken]);

  // Invalidate old room and migrate Host WebRTC to new session token
  const handleSessionTokenChange = (newToken: string) => {
    setStudioSessionToken(newToken);
    if (webrtcEngine.current) {
      webrtcEngine.current.dispose();
      setIsConnectedB(false);
      const rRole = currentUser?.role === 'user' ? 'guest' : 'host';
      const rEngine = new WebRTCAudioEngine(rRole, newToken);
      rEngine.onStatusChange = (st) => {
        setWebrtcStatus(st);
        if (st.connected) setIsConnectedB(true);
      };
      rEngine.onRemoteStream = async (remoteStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.muted = false;
          try {
            await remoteAudioRef.current.play();
          } catch (e) {
            console.warn('[Host] Remote audio playback autoplay prevented:', e);
          }
        }
        if (engineB.current) {
          await engineB.current.startMediaStream(remoteStream);
          setIsConnectedB(true);
          if (isRecordingRef.current) {
            engineB.current.startRecording();
          }
        }
      };
      if (engineA.current?.mediaStream) {
        rEngine.setLocalStream(engineA.current.mediaStream).catch(console.warn);
      }
      webrtcEngine.current = rEngine;
    }
  };

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
  const handleStartRecord = useCallback(async () => {
    if (!isConnectedA && !isConnectedB && !webrtcStatus.connected) {
      alert('Please connect your microphone before starting the recording.');
      return;
    }
    if (engineA.current?.audioContext?.state === 'suspended') {
      await engineA.current.audioContext.resume();
    }
    if (engineB.current?.audioContext?.state === 'suspended') {
      await engineB.current.audioContext.resume();
    }
    engineA.current?.startRecording();
    engineB.current?.startRecording();
    elapsedRef.current = 0;
    setIsRecording(true);
    setIsPaused(false);

    // Start Live Speech-to-Text Engine
    sttEngine.current?.start(hostDisplayNameRef.current, 'host');

    // Inform guest speaker that recording has started
    webrtcEngine.current?.sendSignal({ type: 'RECORDING_STATE', isRecording: true });
  }, [isConnectedA, isConnectedB, webrtcStatus.connected]);

  const handlePause = useCallback(() => {
    if (isPaused) {
      engineA.current?.resumeRecording();
      engineB.current?.resumeRecording();
      setIsPaused(false);
      webrtcEngine.current?.sendSignal({ type: 'RECORDING_STATE', isRecording: true, isPaused: false });
    } else {
      engineA.current?.pauseRecording();
      engineB.current?.pauseRecording();
      setIsPaused(true);
      webrtcEngine.current?.sendSignal({ type: 'RECORDING_STATE', isRecording: true, isPaused: true });
    }
  }, [isPaused]);

  const handleManualUploadToDrive = useCallback(async () => {
    const buf = audioBuffer || bufferA || bufferB;
    if (!buf) {
      alert('No recorded audio available to upload.');
      return;
    }

    const dur = Math.round(buf.duration) || Math.round(elapsedRef.current / 1000) || 1;
    const title = `Podcast Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const sanitized = title.replace(/\s+/g, '_');
    const stereoBlob = encodeWav(buf, 32);

    setDriveUpload({
      isUploading: true,
      progress: 10,
      stageText: 'Uploading audio to Google Drive...',
      sessionTitle: title,
    });

    try {
      const res = await uploadAudioBlobToDrive({
        blob: stereoBlob,
        fileName: `${sanitized}_manual.wav`,
        sessionTitle: title,
        hostName: hostDisplayNameRef.current,
        guestName: guestDisplayNameRef.current,
        durationSeconds: dur,
        onProgress: (pct, stage) => {
          setDriveUpload({ isUploading: true, progress: pct, stageText: stage, sessionTitle: title });
        },
      });

      if (res.success) {
        setDriveUpload({
          isUploading: false,
          progress: 100,
          stageText: 'Session audio uploaded to Google Drive!',
          fileUrl: res.fileUrl,
          sessionTitle: title,
        });
        setUploadModalPopup({
          type: 'success',
          title: 'Audio Uploaded Successfully! 🎉',
          message: `Your podcast master recording has been successfully uploaded to Google Drive.`,
          fileUrl: res.fileUrl,
          sessionTitle: title,
        });
      } else {
        setDriveUpload({
          isUploading: false,
          progress: 0,
          stageText: 'Google Drive upload notice: ' + (res.error || 'Check Google Drive Webhook'),
          error: res.error,
          sessionTitle: title,
        });
        setUploadModalPopup({
          type: 'error',
          title: 'Google Drive Upload Error ⚠️',
          message: 'Failed to upload recorded audio to Google Drive. Please verify your Google Apps Script Webhook deployment settings.',
          error: res.error,
          sessionTitle: title,
        });
      }
    } catch (e: any) {
      setDriveUpload({
        isUploading: false,
        progress: 0,
        stageText: 'Upload failed: ' + (e?.message || 'Network error'),
        error: e?.message || 'Network error',
        sessionTitle: title,
      });
      setUploadModalPopup({
        type: 'error',
        title: 'Google Drive Upload Failed ⚠️',
        message: 'An unexpected network error occurred while uploading audio to Google Drive.',
        error: e?.message || 'Network connection failed',
        sessionTitle: title,
      });
    }
  }, [audioBuffer, bufferA, bufferB]);

  const handleStop = useCallback(() => {
    const bA = engineA.current?.stopRecording() || null;
    const bB = engineB.current?.stopRecording() || null;
    const finalDurationSeconds = Math.max(1, Math.round(elapsedRef.current / 1000));

    setIsRecording(false);
    setIsPaused(false);
    setBufferA(bA);
    setBufferB(bB);

    webrtcEngine.current?.sendSignal({ type: 'RECORDING_STATE', isRecording: false });

    let compiled: AudioBuffer | null = null;
    if (bA && bB && engineA.current?.audioContext) {
      compiled = mergeToStereo(engineA.current.audioContext, bA, bB);
    } else if (bA) {
      compiled = bA;
    } else if (bB) {
      compiled = bB;
    }

    if (!compiled) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const fallbackCtx = engineA.current?.audioContext || new AudioCtx();
        const dur = Math.max(1, finalDurationSeconds);
        compiled = fallbackCtx.createBuffer(2, Math.max(44100, dur * 44100), 44100);
      } catch (e) {
        console.warn('Fallback buffer creation error:', e);
      }
    }

    sttEngine.current?.stop();
    clearRecoverySession();

    if (compiled) {
      setAudioBuffer(compiled);

      const calculatedDuration = Math.max(1, finalDurationSeconds || Math.round(compiled.duration));
      
      // Perform deep acoustic & broadcast analysis (LUFS, Crest Factor, Phase, Talk-Time)
      const acoustic = analyzeAudioBuffer(compiled, bA, bB);

      const sessionTitle = `Podcast Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      // Automatically log recording session to SessionStore for Admin Reports
      const savedSession = saveRecordingSession({
        hostId: currentUser?.id || 'usr_host',
        hostName: hostDisplayNameRef.current || currentUser?.name || 'Sarah Connor (Host)',
        hostEmail: currentUser?.email || 'host@studio.local',
        adminId: currentUser?.adminId || 'usr_admin1',
        organizationName: currentUser?.organizationName,
        guestName: guestDisplayNameRef.current || 'Guest Speaker',
        title: sessionTitle,
        durationSeconds: calculatedDuration,
        channelCount: compiled.numberOfChannels,
        format: 'WAV 32-bit Float',
        sampleRate: compiled.sampleRate,
        bitDepth: 32,
        peakLeftDb: acoustic.truePeakLeftDb,
        peakRightDb: acoustic.truePeakRightDb,
        integratedLufs: acoustic.integratedLufs,
        dynamicRangeScore: acoustic.dynamicRangeScore,
        phaseCorrelation: acoustic.phaseCorrelation,
        hostTalkPercent: acoustic.hostTalkPercent,
        guestTalkPercent: acoustic.guestTalkPercent,
        silencePercent: acoustic.silencePercent,
        cueMarkers: markers.map((m) => ({ id: m.id, time: m.time, label: m.label })),
      });

      // Dispatch storage update so any open Admin tabs update in real-time
      window.dispatchEvent(new Event('storage'));

      // Save raw binary WAV blobs with embedded BWF & RIFF metadata
      try {
        const bwfMeta = {
          title: savedSession.title,
          artist: savedSession.hostName,
          organization: savedSession.organizationName || 'Podcast Craft Studio',
          description: `Host: ${savedSession.hostName} | Guest: ${savedSession.guestName}`,
          loudnessLufs: acoustic.integratedLufs,
          truePeakDb: Math.max(acoustic.truePeakLeftDb, acoustic.truePeakRightDb),
          cueMarkers: markers.map((m) => ({ time: m.time, label: m.label })),
        };

        const stereoBlob = encodeWav(compiled, 32, bwfMeta);
        const blobA = bA ? encodeWav(bA, 32, { ...bwfMeta, title: `${savedSession.title} - Host Stem` }) : undefined;
        const blobB = bB ? encodeWav(bB, 32, { ...bwfMeta, title: `${savedSession.title} - Guest Stem` }) : undefined;
        saveSessionAudioBlobs(savedSession.id, stereoBlob, blobA, blobB);

        // Auto-upload recorded audio directly to Google Drive folder if enabled
        if (getAutoUploadToDrive()) {
          const sanitized = savedSession.title.replace(/\s+/g, '_');
          setDriveUpload({
            isUploading: true,
            progress: 5,
            stageText: 'Starting Google Drive auto-upload (0%)...',
            sessionTitle: savedSession.title,
          });

          uploadAudioBlobToDrive({
            blob: stereoBlob,
            fileName: `${sanitized}_${savedSession.id.slice(0, 8)}.wav`,
            sessionTitle: savedSession.title,
            hostName: savedSession.hostName,
            guestName: savedSession.guestName,
            durationSeconds: savedSession.durationSeconds,
            onProgress: (pct, stage) => {
              setDriveUpload((prev) => (prev ? { ...prev, isUploading: true, progress: pct, stageText: stage } : null));
            },
          }).then((res) => {
            if (res.success) {
              if (res.fileUrl) {
                updateSessionDriveStatus(savedSession.id, res.fileUrl);
              }
              setDriveUpload({
                isUploading: false,
                progress: 100,
                stageText: 'Session audio uploaded to Google Drive!',
                fileUrl: res.fileUrl,
                sessionTitle: savedSession.title,
              });
              setUploadModalPopup({
                type: 'success',
                title: 'Audio Uploaded Successfully! 🎉',
                message: `Your podcast recording "${savedSession.title}" has been saved and automatically uploaded to Google Drive.`,
                fileUrl: res.fileUrl,
                sessionTitle: savedSession.title,
              });
              window.dispatchEvent(new Event('storage'));
            } else {
              setDriveUpload({
                isUploading: false,
                progress: 0,
                stageText: 'Google Drive auto-upload: ' + (res.error || 'Check Drive settings'),
                error: res.error,
                sessionTitle: savedSession.title,
              });
              setUploadModalPopup({
                type: 'error',
                title: 'Google Drive Auto-Upload Notice ⚠️',
                message: 'Your recording was saved locally in the studio, but auto-upload to Google Drive encountered an issue. You can click "Upload to Google Drive" to retry.',
                error: res.error,
                sessionTitle: savedSession.title,
              });
            }
          }).catch((e) => {
            setDriveUpload({
              isUploading: false,
              progress: 0,
              stageText: 'Google Drive auto-upload failed',
              error: e?.message || 'Unknown network error',
              sessionTitle: savedSession.title,
            });
            setUploadModalPopup({
              type: 'error',
              title: 'Google Drive Auto-Upload Failed ⚠️',
              message: 'Recording saved locally. Network error prevented automatic Google Drive upload.',
              error: e?.message || 'Network error',
              sessionTitle: savedSession.title,
            });
          });
        }
      } catch (err) {
        console.error('Failed saving session audio blob:', err);
      }
    }
  }, [currentUser?.id, currentUser?.email, currentUser?.name, currentUser?.adminId, currentUser?.organizationName, markers]);

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
    } else {
      setIsMutedA((prev) => !prev);
    }
  };

  const handleMuteB = () => {
    if (engineB.current) {
      const muted = engineB.current.toggleMute();
      setIsMutedB(muted);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = muted;
        remoteAudioRef.current.volume = muted ? 0 : Math.min(1, Math.max(0, gainB));
      }
    } else {
      setIsMutedB((prev) => {
        const next = !prev;
        if (remoteAudioRef.current) {
          remoteAudioRef.current.muted = next;
          remoteAudioRef.current.volume = next ? 0 : Math.min(1, Math.max(0, gainB));
        }
        return next;
      });
    }
  };

  const handleGainChangeA = (val: number) => {
    setGainA(val);
    engineA.current?.setGain(val);
  };

  const handleGainChangeB = (val: number) => {
    setGainB(val);
    engineB.current?.setGain(val);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = isMutedB ? 0 : Math.min(1, Math.max(0, val));
    }
  };

  const handlePresetChangeA = (preset: string) => {
    setVocalPresetA(preset);
    engineA.current?.applyVocalPreset(preset);
  };

  const handlePresetChangeB = (preset: string) => {
    setVocalPresetB(preset);
    engineB.current?.applyVocalPreset(preset);
  };

  const handleToggleNoiseA = () => {
    const next = !isNoiseA;
    setIsNoiseA(next);
    engineA.current?.setNoiseSuppression(next);
  };

  const handleToggleNoiseB = () => {
    const next = !isNoiseB;
    setIsNoiseB(next);
    engineB.current?.setNoiseSuppression(next);
  };

  const handleSoloA = () => {
    const next = !soloA;
    setSoloA(next);
    if (next) {
      setSoloB(false);
      if (!isMutedB) handleMuteB();
    }
  };

  const handleSoloB = () => {
    const next = !soloB;
    setSoloB(next);
    if (next) {
      setSoloA(false);
      if (!isMutedA) handleMuteA();
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
        <div className="daw-brand">
          <div className="daw-logo-circle">
            <Radio size={18} />
          </div>
          <span className="daw-brand-title">PODCAST CRAFT STUDIO</span>
          <span className="daw-badge">DUAL-CHANNEL DAW</span>
        </div>

        {/* Global Connection & User Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ThemeToggle />

          <button
            className="btn-transport btn-cyan"
            onClick={() => setShowInviteModal(true)}
            style={{ height: '32px', padding: '0 12px', fontSize: '0.75rem' }}
          >
            <UserPlus size={13} /> Invite Guest Speaker
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Activity size={14} color={isConnectedA ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <span>{isConnectedA ? 'Host Mic Ready' : 'Mic Offline'}</span>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className="user-menu-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              title="Account Menu"
            >
              <div className="user-avatar">{hostDisplayName.charAt(0).toUpperCase()}</div>
              <span>{hostDisplayName}</span>
            </button>

            {showUserMenu && (
              <div className="user-menu-dropdown">
                <div className="user-menu-info">
                  <div style={{ fontWeight: 600 }}>{hostDisplayName}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{currentUser?.email || 'host@studio.local'}</div>
                  <span className={`role-badge ${isAdmin ? 'role-admin' : 'role-host'}`} style={{ marginTop: '4px' }}>
                    {currentUser?.role?.toUpperCase() || 'HOST'}
                  </span>
                </div>
                <button className="user-menu-item user-menu-danger" onClick={logout}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Studio Console — Option 2: Modern Creator Suite */}
      <main className="podcast-main" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* 1. Floating / Top Creator Transport Island */}
        <div className="creator-transport-island">
          {/* Left: Recording Triggers & Timer */}
          <div className="creator-transport-left">
            <button
              type="button"
              className={`creator-record-btn ${isRecording ? 'btn-rec-active' : 'btn-rec-start'}`}
              onClick={isRecording ? handleStop : handleStartRecord}
            >
              <Mic size={15} />
              <span>{isRecording ? (isPaused ? 'PAUSED' : 'ON AIR • RECORDING') : 'RECORD PODCAST'}</span>
            </button>

            <div className="creator-timer-badge">
              <Clock size={15} color="var(--accent-cyan)" />
              <span>{formatTime(elapsedMs)}</span>
            </div>

            {isRecording && (
              <button className="creator-quick-btn" onClick={handlePause} title={isPaused ? 'Resume recording' : 'Pause recording'}>
                {isPaused ? <Mic size={14} color="var(--accent-green)" /> : <Pause size={14} />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>
            )}

            {isRecording && (
              <button className="creator-quick-btn" onClick={handleStop} title="Stop and finalize recording session">
                <Square size={14} color="var(--accent-red)" />
                <span>Finish & Save</span>
              </button>
            )}

            {hasAudio && !isRecording && (
              <button className="creator-quick-btn" onClick={handleClear} title="Clear current session buffers">
                <Trash2 size={14} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Center: Live WebRTC Guest Status Pill */}
          <div className="creator-transport-center">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: webrtcStatus.connected ? 'rgba(0, 255, 135, 0.12)' : 'rgba(255, 183, 0, 0.12)',
                border: `1px solid ${webrtcStatus.connected ? 'rgba(0, 255, 135, 0.35)' : 'rgba(255, 183, 0, 0.35)'}`,
                color: webrtcStatus.connected ? 'var(--accent-green)' : 'var(--accent-amber)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: webrtcStatus.connected ? 'var(--accent-green)' : 'var(--accent-amber)',
                  boxShadow: webrtcStatus.connected ? '0 0 8px var(--accent-green)' : '0 0 8px var(--accent-amber)',
                }}
              />
              <span>
                {webrtcStatus.connected
                  ? `Guest Live: ${guestDisplayName} (P2P Call Active)`
                  : 'Guest Standby: Waiting to Join'}
              </span>
            </div>

            {!webrtcStatus.connected && (
              <button
                className="creator-quick-btn active-cyan"
                onClick={() => setShowInviteModal(true)}
              >
                <UserPlus size={12} /> Invite Guest
              </button>
            )}
          </div>

          {/* Right: Cloud Sync, Shortcuts & Master Export */}
          <div className="creator-transport-right">
            {hasAudio && (
              <button
                className={`creator-quick-btn ${isWebhookConfigured ? 'active-cyan' : ''}`}
                onClick={handleManualUploadToDrive}
                disabled={driveUpload?.isUploading}
                title="Sync recorded session to Google Drive"
              >
                {driveUpload?.isUploading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CloudUpload size={13} color={isWebhookConfigured ? 'var(--accent-green)' : 'var(--text-muted)'} />
                )}
                <span>{driveUpload?.isUploading ? `${driveUpload.progress}%` : 'Drive Sync'}</span>
              </button>
            )}

            <button className="creator-quick-btn" onClick={() => setShowHelp(true)} title="Keyboard Shortcuts">
              <HelpCircle size={13} /> Shortcuts
            </button>

            <button
              className={`creator-quick-btn ${isAdmin ? 'active-cyan' : ''}`}
              onClick={() => {
                if (!isAdmin) {
                  alert('🔒 EXPORT RESTRICTED: Only System Administrators have permission to export or download recorded audio files. Please contact your Admin to obtain exported WAV files.');
                  return;
                }
                setShowExport(true);
              }}
              disabled={!hasAudio || isRecording}
              title={!isAdmin ? 'Audio export is restricted to Admin only' : 'Export Master WAV & Stems'}
              style={{ opacity: !isAdmin ? 0.7 : 1 }}
            >
              {isAdmin ? <Download size={13} /> : <Lock size={13} color="var(--accent-amber)" />}
              <span>{isAdmin ? 'Export Master' : 'Export (Admin)'}</span>
            </button>
          </div>
        </div>

        {/* 2. Top Half: Live Broadcast Stage / Speaker Cards */}
        <section className="creator-stage-section">
          <div className="creator-stage-grid">
            {/* Host Speaker Card */}
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

            {/* Remote Guest Speaker Card */}
            <SpeakerPanel
              label="SPEAKER B (GUEST)"
              role="guest"
              color="amber"
              devices={[]}
              selectedDeviceId=""
              onDeviceChange={() => {}}
              isMuted={isMutedB}
              onToggleMute={handleMuteB}
              gain={gainB}
              onGainChange={handleGainChangeB}
              isSolo={soloB}
              onToggleSolo={handleSoloB}
              analysisData={analysisB}
              isRecording={isRecording}
              isConnected={isConnectedB || webrtcStatus.connected}
              userName={guestDisplayName}
              onOpenFx={() => {
                setActiveFxEngine(engineB.current);
                setActiveFxLabel('Speaker B (Guest)');
              }}
              isNoiseSuppressed={isNoiseB}
              onToggleNoiseSuppression={handleToggleNoiseB}
              vocalPreset={vocalPresetB}
              onPresetChange={handlePresetChangeB}
            />
          </div>
        </section>

        {/* 3. Bottom Half: Split Studio Workspace (50 / 50 Grid) */}
        <section className="creator-workspace-split">
          {/* Left Column: Live Synced Transcript & Storyboard */}
          <div className="creator-workspace-pane">
            <TranscriptPanel
              embedded={true}
              items={transcriptItems}
              onClear={() => setTranscriptItems([])}
              currentLanguage={currentLanguage}
              onLanguageChange={handleLanguageChange}
              onSeekAudio={(sec) => setSeekTargetTime(sec)}
            />
          </div>

          {/* Right Column: Multi-Track Waveform Timeline & Production Tools */}
          <div className="creator-workspace-pane">
            <div className="creator-pane-card">
              {/* Card Header with Production Tools Tabs */}
              <div className="creator-pane-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Radio className="daw-logo-icon" size={18} />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    STUDIO WAVEFORM & PRODUCTION DECK
                  </span>
                </div>

                {/* Tab Switcher for Soundboard vs Markers */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className={`creator-quick-btn ${activeRightTab === 'soundboard' ? 'active-cyan' : ''}`}
                    onClick={() => setActiveRightTab('soundboard')}
                  >
                    🔊 MPC Soundboard
                  </button>
                  <button
                    type="button"
                    className={`creator-quick-btn ${activeRightTab === 'markers' ? 'active-cyan' : ''}`}
                    onClick={() => setActiveRightTab('markers')}
                  >
                    📍 Cue Markers ({markers.length})
                  </button>
                </div>
              </div>

              {/* Multi-Track Waveform Timeline */}
              <div style={{ flex: 1, minHeight: '220px', marginBottom: '12px' }}>
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
                  seekTime={seekTargetTime}
                />
              </div>

              {/* Lower Tray: MPC Soundboard or Cue Markers */}
              <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-dim)' }}>
                {activeRightTab === 'soundboard' ? (
                  <SoundboardPanel audioContext={engineA.current?.audioContext || null} />
                ) : (
                  <MarkerList
                    markers={markers}
                    onDeleteMarker={(id) => setMarkers(markers.filter((m) => m.id !== id))}
                    onJumpToMarker={(t) => setSeekTargetTime(t)}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

      </main>


      {/* Modals */}
      {showInviteModal && (
        <GuestInviteModal
          hostName={hostDisplayName}
          sessionToken={studioSessionToken}
          onSessionTokenChange={handleSessionTokenChange}
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

      {/* Live WebRTC Remote Guest Audio Element for Bi-Directional Call Playback (Mobile WebKit safe) */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0.001,
          pointerEvents: 'none',
        }}
      />

      {/* Real-Time Google Drive Upload Progress Banner */}
      {driveUpload && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          background: 'rgba(18, 22, 34, 0.95)',
          border: `1px solid ${driveUpload.error ? 'var(--accent-red)' : driveUpload.progress === 100 ? 'var(--accent-green)' : 'var(--accent-cyan)'}`,
          borderRadius: '10px',
          padding: '14px 18px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(12px)',
          minWidth: '320px',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.82rem' }}>
              {driveUpload.isUploading ? (
                <Loader2 size={16} className="animate-spin" color="var(--accent-cyan)" />
              ) : (
                <Cloud size={16} color={driveUpload.error ? 'var(--accent-red)' : 'var(--accent-green)'} />
              )}
              <span>
                {driveUpload.isUploading
                  ? `Uploading to Google Drive (${driveUpload.progress}%)`
                  : driveUpload.progress === 100
                  ? 'Uploaded to Google Drive'
                  : 'Google Drive Sync Error'}
              </span>
            </div>
            <button
              onClick={() => setDriveUpload(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            {driveUpload.sessionTitle && <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>{driveUpload.sessionTitle}</div>}
            <div>{driveUpload.stageText}</div>
            {driveUpload.error && (
              <div style={{ color: 'var(--accent-red)', marginTop: '4px', fontSize: '0.7rem' }}>
                {driveUpload.error}
              </div>
            )}
          </div>

          {/* Progress bar */}
          {driveUpload.isUploading && (
            <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${driveUpload.progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-green))',
                borderRadius: '3px',
                transition: 'width 0.2s ease',
              }} />
            </div>
          )}

          {driveUpload.progress === 100 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px', fontSize: '0.72rem', color: 'var(--accent-green)', fontWeight: 600 }}>
              ✓ Saved to Cloud
            </div>
          )}
        </div>
      )}

      {/* Google Drive Upload Success / Error Popup Modal */}
      {uploadModalPopup && (
        <DriveUploadNotificationModal
          type={uploadModalPopup.type}
          title={uploadModalPopup.title}
          message={uploadModalPopup.message}
          fileUrl={uploadModalPopup.fileUrl}
          error={uploadModalPopup.error}
          sessionTitle={uploadModalPopup.sessionTitle}
          onClose={() => setUploadModalPopup(null)}
          onRetry={uploadModalPopup.type === 'error' ? handleManualUploadToDrive : undefined}
        />
      )}
    </div>
  );
};
