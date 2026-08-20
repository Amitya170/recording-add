import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, type User } from '../../auth/AuthContext';
import {
  getAnalyticsSummary,
  getUserDurationReports,
  getStoredSessions,
  formatDuration,
  createAudioBuffersForSession,
  generateCombinedMetadataJSON,
  generateCombinedMetadataTXT,
  generateSessionsCSV,
  updateSessionDriveStatus,
  deleteStoredSession,
  purgeOldSessions,
  clearAllSessions,
  type RecordingSession,
  type UserDurationReport,
} from '../../auth/SessionStore';
import {
  Shield,
  Users,
  Clock,
  Mic,
  BarChart3,
  UserPlus,
  Trash2,
  LogOut,
  CheckCircle,
  AlertCircle,
  FileAudio,
  FileCode,
  Download,
  FileSpreadsheet,
  Search,
  Play,
  Pause,
  CloudUpload,
  Copy,
  Check,
  HelpCircle,
  Loader2,
  FolderSync,
  X,
  Key,
  Edit2,
  Database,
  Zap,
} from 'lucide-react';
import { AudioMetadataModal } from './AudioMetadataModal';
import { ExportModal } from '../Export/ExportModal';
import { encodeWav } from '../../audio/encoders/WavEncoder';
import { DriveUploadNotificationModal } from '../Modals/DriveUploadNotificationModal';
import { ThemeToggle } from '../Common/ThemeToggle';

import { getSessionAudioBlobs, deleteSessionAudioBlobs, clearAllAudioBlobs } from '../../auth/CloudAudioStore';
import {
  getGoogleDriveWebhookUrl,
  setGoogleDriveWebhookUrl,
  getGoogleDriveFolderUrl,
  setGoogleDriveFolderUrl,
  getAutoUploadToDrive,
  setAutoUploadToDrive,
  uploadAudioBlobToDrive,
  testGoogleDriveConnection,
  APPS_SCRIPT_TEMPLATE,
} from '../../auth/GoogleDriveUploader';

export const AdminPanel: React.FC = () => {
  const { getAllUsers, getHostsForAdmin, createHostAccount, deleteUser, updateUser, currentUser, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'users' | 'cloud'>('overview');
  const [userReports, setUserReports] = useState<UserDurationReport[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormat, setFilterFormat] = useState('all');
  const [summary, setSummary] = useState({
    totalUsers: 0,
    totalSessions: 0,
    totalDurationSeconds: 0,
    avgDurationSeconds: 0,
  });

  const [storageInfo, setStorageInfo] = useState({ usedMb: 0, limitMb: 5120 });
  const [storageActionMsg, setStorageActionMsg] = useState<string | null>(null);
  
  // Audition Player State
  const [previewingSession, setPreviewingSession] = useState<RecordingSession | null>(null);
  const [auditionCurrentTime, setAuditionCurrentTime] = useState(0);
  const [auditionDuration, setAuditionDuration] = useState(0);
  const [auditionIsPlaying, setAuditionIsPlaying] = useState(false);
  const [auditionSpeed, setAuditionSpeed] = useState(1.0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Google Drive Cloud Storage Settings State
  const [driveWebhookUrl, setDriveWebhookUrl] = useState(getGoogleDriveWebhookUrl());
  const [driveFolderUrl, setDriveFolderUrl] = useState(getGoogleDriveFolderUrl());
  const [autoUploadDrive, setAutoUploadDriveState] = useState(getAutoUploadToDrive());
  const [driveSaveSuccess, setDriveSaveSuccess] = useState(false);
  const [showScriptGuideModal, setShowScriptGuideModal] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [uploadingSessionId, setUploadingSessionId] = useState<string | null>(null);
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<string, { progress: number; stageText: string }>>({});
  const [driveUploadMessage, setDriveUploadMessage] = useState<{ id: string; success: boolean; text: string; url?: string } | null>(null);
  const [testingDriveConnection, setTestingDriveConnection] = useState(false);
  const [testDriveResult, setTestDriveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Edit Host / Reset Password Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserMsg, setEditUserMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [drivePopupModal, setDrivePopupModal] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    fileUrl?: string;
    error?: string;
    sessionTitle?: string;
    retrySession?: RecordingSession;
  } | null>(null);

  useEffect(() => {
    // Dynamically query browser IndexedDB storage quota
    const checkStorageQuota = async () => {
      let limitMb = 5120; // 5 GB baseline
      let usedMb = Number(sessions.reduce((acc, s) => acc + (s.fileSizeMb || 0), 0).toFixed(1));

      if (navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota) {
            limitMb = Math.round(estimate.quota / (1024 * 1024));
          }
          if (estimate.usage) {
            usedMb = Number((estimate.usage / (1024 * 1024)).toFixed(1));
          }
        } catch (e) {
          console.warn('Storage estimate failed:', e);
        }
      }

      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      setStorageInfo({ usedMb, limitMb });
    };

    checkStorageQuota();
  }, [sessions]);

  // Add Host Form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [selectedSessionForMetadata, setSelectedSessionForMetadata] = useState<RecordingSession | null>(null);
  const [exportModalSession, setExportModalSession] = useState<{
    session: RecordingSession;
    audioBuffer: AudioBuffer;
    speakerABuffer: AudioBuffer;
    speakerBBuffer: AudioBuffer;
  } | null>(null);

  const refreshData = useCallback(() => {
    const adminId = currentUser?.id;
    const hosts = getHostsForAdmin(adminId);
    const reports = getUserDurationReports(hosts, adminId);
    setUserReports(reports);
    const sess = getStoredSessions(adminId);
    setSessions(sess);
    setSummary(getAnalyticsSummary(hosts.length, adminId));
  }, [getHostsForAdmin, currentUser]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    const handleStorage = () => refreshData();
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshData();
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshData]);

  // Deletion and Storage Maintenance Handlers
  const handleDeleteSingleSession = async (session: RecordingSession) => {
    if (window.confirm(`Are you sure you want to delete "${session.title}"? This permanently frees the recorded audio blobs and metadata.`)) {
      if (previewingSession?.id === session.id) {
        handleCloseAudition();
      }
      deleteStoredSession(session.id);
      await deleteSessionAudioBlobs(session.id);
      refreshData();
      setStorageActionMsg(`Deleted session "${session.title}".`);
      setTimeout(() => setStorageActionMsg(null), 3000);
    }
  };

  const handlePurgeOldSessions = async (days: number = 30) => {
    if (window.confirm(`Purge all recorded podcast sessions older than ${days} days to reclaim storage?`)) {
      const purged = purgeOldSessions(days);
      refreshData();
      setStorageActionMsg(`Purged ${purged} session(s) older than ${days} days.`);
      setTimeout(() => setStorageActionMsg(null), 3500);
    }
  };

  const handleClearAllStorage = async () => {
    if (window.confirm('⚠️ DANGER: Permanently clear all stored podcast sessions and audio files from browser cache?')) {
      if (window.confirm('Are you absolutely certain? This cannot be undone.')) {
        handleCloseAudition();
        clearAllSessions();
        await clearAllAudioBlobs();
        refreshData();
        setStorageActionMsg('All studio recording storage has been reset.');
        setTimeout(() => setStorageActionMsg(null), 3500);
      }
    }
  };

  // Google Drive Webhook Test Connection
  const handleTestDriveConnection = async () => {
    setTestingDriveConnection(true);
    setTestDriveResult(null);
    try {
      const res = await testGoogleDriveConnection(driveWebhookUrl);
      setTestDriveResult(res);
    } catch (err: any) {
      setTestDriveResult({
        success: false,
        message: err?.message || 'Failed to ping Google Apps Script.',
      });
    } finally {
      setTestingDriveConnection(false);
    }
  };

  // Edit Host / Reset Password Handlers
  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserPassword('');
    setEditUserMsg(null);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserMsg(null);

    const ok = await updateUser(editingUser.id, {
      name: editUserName,
      password: editUserPassword || undefined,
    });

    if (ok) {
      setEditUserMsg({ type: 'success', text: `Updated ${editingUser.email} successfully!` });
      refreshData();
      setTimeout(() => {
        setEditingUser(null);
        setEditUserMsg(null);
      }, 1500);
    } else {
      setEditUserMsg({ type: 'error', text: 'Failed to update user.' });
    }
  };

  const handleAdminExportSession = async (session: RecordingSession) => {
    const stored = await getSessionAudioBlobs(session.id);
    if (stored && stored.stereoBlob) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const arrayBuf = await stored.stereoBlob.arrayBuffer();
        const mainBuf = await ctx.decodeAudioData(arrayBuf);

        let bufA = mainBuf;
        let bufB = mainBuf;

        if (stored.speakerABlob) {
          const arrA = await stored.speakerABlob.arrayBuffer();
          bufA = await ctx.decodeAudioData(arrA);
        }
        if (stored.speakerBBlob) {
          const arrB = await stored.speakerBBlob.arrayBuffer();
          bufB = await ctx.decodeAudioData(arrB);
        }

        setExportModalSession({
          session,
          audioBuffer: mainBuf,
          speakerABuffer: bufA,
          speakerBBuffer: bufB,
        });
      } catch (err) {
        console.error('Error decoding audio blobs for export modal:', err);
      }
    } else {
      const bufs = createAudioBuffersForSession(session);
      setExportModalSession({
        session,
        audioBuffer: bufs.audioBuffer,
        speakerABuffer: bufs.speakerABuffer,
        speakerBBuffer: bufs.speakerBBuffer,
      });
    }
  };

  const handleTogglePreviewAudio = async (session: RecordingSession) => {
    if (previewAudioRef.current) {
      if (previewingSession?.id === session.id) {
        if (auditionIsPlaying) {
          previewAudioRef.current.pause();
          setAuditionIsPlaying(false);
        } else {
          previewAudioRef.current.play();
          setAuditionIsPlaying(true);
        }
        return;
      }
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    let blobToPlay: Blob | null = null;
    const stored = await getSessionAudioBlobs(session.id);
    if (stored && stored.stereoBlob) {
      blobToPlay = stored.stereoBlob;
    } else {
      const bufs = createAudioBuffersForSession(session);
      blobToPlay = encodeWav(bufs.audioBuffer, 16);
    }

    if (blobToPlay) {
      const url = URL.createObjectURL(blobToPlay);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      setPreviewingSession(session);
      setAuditionIsPlaying(true);
      audio.playbackRate = auditionSpeed;

      audio.ontimeupdate = () => {
        setAuditionCurrentTime(audio.currentTime);
        if (audio.duration && !isNaN(audio.duration)) {
          setAuditionDuration(audio.duration);
        }
      };

      audio.onloadedmetadata = () => {
        setAuditionDuration(audio.duration || session.durationSeconds);
      };

      audio.onended = () => {
        setAuditionIsPlaying(false);
        setAuditionCurrentTime(0);
      };

      audio.onerror = () => {
        setPreviewingSession(null);
        setAuditionIsPlaying(false);
      };

      audio.play().catch((err) => {
        console.warn('Playback error:', err);
        setPreviewingSession(null);
        setAuditionIsPlaying(false);
      });
    }
  };

  const handleAuditionSeek = (seconds: number) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.currentTime = seconds;
      setAuditionCurrentTime(seconds);
    }
  };

  const handleAuditionSpeedChange = (speed: number) => {
    setAuditionSpeed(speed);
    if (previewAudioRef.current) {
      previewAudioRef.current.playbackRate = speed;
    }
  };

  const handleCloseAudition = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingSession(null);
    setAuditionIsPlaying(false);
    setAuditionCurrentTime(0);
  };

  const handleExportCombinedJSON = () => {
    const jsonStr = generateCombinedMetadataJSON(sessions, summary.totalUsers);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Combined_Studio_Metadata_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleExportCombinedTXT = () => {
    const txtStr = generateCombinedMetadataTXT(sessions, summary.totalUsers);
    const blob = new Blob([txtStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Combined_Studio_Report_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleExportCombinedCSV = () => {
    const csvStr = generateSessionsCSV(sessions);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Studio_Sessions_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleSaveDriveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleDriveWebhookUrl(driveWebhookUrl);
    setGoogleDriveFolderUrl(driveFolderUrl);
    setAutoUploadToDrive(autoUploadDrive);
    setDriveSaveSuccess(true);
    setTimeout(() => setDriveSaveSuccess(false), 3000);
  };

  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleUploadSessionToDrive = async (session: RecordingSession) => {
    const webhook = getGoogleDriveWebhookUrl();
    if (!webhook) {
      alert('Please configure and save your Google Drive Webhook URL first in the Google Drive Cloud Storage panel.');
      return;
    }

    setUploadingSessionId(session.id);
    setUploadProgressMap((prev) => ({
      ...prev,
      [session.id]: { progress: 5, stageText: 'Preparing audio file...' },
    }));
    setDriveUploadMessage(null);

    let blobToUpload: Blob;
    const stored = await getSessionAudioBlobs(session.id);
    if (stored && stored.stereoBlob) {
      blobToUpload = stored.stereoBlob;
    } else {
      const bufs = createAudioBuffersForSession(session);
      blobToUpload = encodeWav(bufs.audioBuffer, 16);
    }

    const sanitized = session.title.replace(/\s+/g, '_');
    const fileName = `${sanitized}_${session.id.slice(0, 8)}.wav`;

    try {
      const res = await uploadAudioBlobToDrive({
        blob: blobToUpload,
        fileName,
        sessionTitle: session.title,
        hostName: session.hostName,
        guestName: session.guestName,
        durationSeconds: session.durationSeconds,
        onProgress: (pct, stage) => {
          setUploadProgressMap((prev) => ({
            ...prev,
            [session.id]: { progress: pct, stageText: stage },
          }));
        },
      });

      if (res.success && res.fileUrl) {
        updateSessionDriveStatus(session.id, res.fileUrl);
        refreshData();
        setDriveUploadMessage({
          id: session.id,
          success: true,
          text: 'Uploaded to Google Drive (100%)',
          url: res.fileUrl,
        });
        setDrivePopupModal({
          type: 'success',
          title: 'Audio Uploaded Successfully! 🎉',
          message: `The recording session "${session.title}" was successfully uploaded to your Google Drive.`,
          fileUrl: res.fileUrl,
          sessionTitle: session.title,
        });
      } else {
        setDriveUploadMessage({
          id: session.id,
          success: false,
          text: res.error || 'Failed uploading to Google Drive',
        });
        setDrivePopupModal({
          type: 'error',
          title: 'Google Drive Upload Error ⚠️',
          message: res.error || 'Failed to upload session audio to Google Drive. Please ensure your Google Apps Script is deployed with access set to Anyone.',
          error: res.error,
          sessionTitle: session.title,
          retrySession: session,
        });
      }
    } catch (err: any) {
      setDriveUploadMessage({
        id: session.id,
        success: false,
        text: err?.message || 'Upload error',
      });
      setDrivePopupModal({
        type: 'error',
        title: 'Google Drive Upload Failed ⚠️',
        message: 'Network error prevented upload to Google Drive.',
        error: err?.message || 'Network error',
        sessionTitle: session.title,
        retrySession: session,
      });
    } finally {
      setUploadingSessionId(null);
    }
  };

  const handleCreateHost = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');

    if (!newName || !newEmail || !newPassword) {
      setAddError('All fields are required.');
      return;
    }

    const ok = await createHostAccount(newEmail, newName, newPassword);
    if (ok) {
      setAddSuccess(`Host account created for ${newEmail}`);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      refreshData();
      setTimeout(() => setAddSuccess(''), 3500);
    } else {
      setAddError('An account with this email already exists.');
    }
  };

  const handleDeleteUser = (id: string) => {
    if (id === currentUser?.id) return;
    if (window.confirm('Are you sure you want to delete this Host account?')) {
      deleteUser(id);
      refreshData();
    }
  };

  const maxDuration = Math.max(1, ...userReports.map((r) => r.totalDurationSeconds));

  return (
    <div className="admin-page">
      {/* Admin Top Bar with Tabs Navigation */}
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={24} className="daw-logo-icon" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="daw-title" style={{ fontSize: '1.15rem' }}>ADMIN CREATOR CONSOLE</h1>
                {currentUser?.organizationName && (
                  <span className="daw-badge" style={{ color: 'var(--accent-cyan)', borderColor: 'rgba(0, 240, 255, 0.4)', background: 'rgba(0, 240, 255, 0.08)' }}>
                    🏢 {currentUser.organizationName}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                Dedicated Studio Intelligence & Isolated Host Management
              </div>
            </div>
          </div>

          {/* Center Tabs Navigation */}
          <div className="admin-nav-tabs">
            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <BarChart3 size={14} />
              <span>Overview</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'sessions' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              <Mic size={14} />
              <span>Sessions</span>
              <span className="admin-tab-badge">{sessions.length}</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'users' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={14} />
              <span>Host Accounts</span>
              <span className="admin-tab-badge">{userReports.length}</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'cloud' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('cloud')}
            >
              <FolderSync size={14} />
              <span>Cloud Storage</span>
              {autoUploadDrive && <span className="admin-tab-badge" style={{ color: 'var(--accent-green)' }}>AUTO</span>}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ThemeToggle />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--accent-cyan)' }}>{currentUser?.name}</strong>
            </div>
            <button className="creator-quick-btn active-red" onClick={logout} style={{ height: '30px' }}>
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Global Notification Banner for Storage Actions */}
      {storageActionMsg && (
        <div style={{ margin: '8px 24px -6px 24px', padding: '8px 14px', background: 'rgba(0, 240, 255, 0.12)', border: '1px solid var(--accent-cyan)', borderRadius: '8px', color: 'var(--accent-cyan)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeSlideUp 0.3s ease' }}>
          <CheckCircle size={14} /> <span>{storageActionMsg}</span>
        </div>
      )}

      {/* Main Admin Content Views */}
      <main className="admin-dashboard-main" style={{ padding: '16px 24px', overflowY: 'auto' }}>
        
        {/* TAB 1: OVERVIEW & SYSTEM HEALTH */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Top 4 Stat Summary Cards */}
            <section className="stat-cards-grid">
              <div className="card-panel stat-card">
                <div className="stat-card-header">
                  <span>TOTAL HOST USERS</span>
                  <Users size={18} color="var(--accent-cyan)" />
                </div>
                <div className="stat-card-val">{summary.totalUsers}</div>
                <div className="stat-card-sub">Active Registered Hosts</div>
              </div>

              <div className="card-panel stat-card">
                <div className="stat-card-header">
                  <span>TOTAL PODCAST SESSIONS</span>
                  <Mic size={18} color="var(--accent-amber)" />
                </div>
                <div className="stat-card-val">{summary.totalSessions}</div>
                <div className="stat-card-sub">Dual-Channel Studio Recordings</div>
              </div>

              <div className="card-panel stat-card">
                <div className="stat-card-header">
                  <span>CUMULATIVE DURATION</span>
                  <Clock size={18} color="var(--accent-green)" />
                </div>
                <div className="stat-card-val" style={{ color: 'var(--accent-green)' }}>
                  {formatDuration(summary.totalDurationSeconds)}
                </div>
                <div className="stat-card-sub">Total On-Air Studio Time</div>
              </div>

              <div className="card-panel stat-card">
                <div className="stat-card-header">
                  <span>AVG SESSION LENGTH</span>
                  <BarChart3 size={18} color="#c084fc" />
                </div>
                <div className="stat-card-val" style={{ color: '#c084fc' }}>
                  {formatDuration(summary.avgDurationSeconds)}
                </div>
                <div className="stat-card-sub">Average Recording Duration</div>
              </div>
            </section>

            {/* Studio Health & Storage Monitor */}
            <section className="card-panel" style={{ padding: '16px 20px' }}>
              <div className="card-header" style={{ marginBottom: '12px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={16} color="var(--accent-cyan)" />
                  <span>SYSTEM HEALTH & INFRASTRUCTURE STATUS</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="creator-quick-btn"
                    onClick={() => handlePurgeOldSessions(30)}
                    title="Purge recorded sessions older than 30 days"
                    style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                  >
                    <Database size={11} /> Purge &gt;30d Sessions
                  </button>
                  <button
                    className="creator-quick-btn active-red"
                    onClick={handleClearAllStorage}
                    title="Clear all stored audio and session logs"
                    style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                  >
                    <Trash2 size={11} /> Reset All Storage
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileAudio size={14} color="var(--accent-cyan)" />
                      IndexedDB Browser Storage:
                    </span>
                    <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {storageInfo.usedMb} MB / {(storageInfo.limitMb / 1024).toFixed(1)} GB
                    </strong>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
                    <div
                      style={{
                        width: `${Math.max(1, (storageInfo.usedMb / storageInfo.limitMb) * 100).toFixed(1)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--accent-cyan), #00ff87)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} color="var(--accent-green)" />
                      P2P WebRTC Signaling:
                    </span>
                    <strong style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>ONLINE (Active)</strong>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
                    <div style={{ width: '100%', height: '100%', background: 'var(--accent-green)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CloudUpload size={14} color="#7c3aed" />
                      Google Drive Cloud Sync:
                    </span>
                    <strong style={{ color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
                      {autoUploadDrive ? 'AUTO-SYNC ACTIVE' : (driveWebhookUrl ? 'MANUAL SYNC' : 'NOT CONFIGURED')}
                    </strong>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
                    <div style={{ width: driveWebhookUrl ? '100%' : '20%', height: '100%', background: driveWebhookUrl ? '#7c3aed' : 'var(--accent-amber)' }} />
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Actions Bar */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="creator-quick-btn active-cyan" onClick={() => setActiveTab('sessions')}>
                <Mic size={14} /> View All {sessions.length} Recording Sessions
              </button>
              <button className="creator-quick-btn" onClick={() => setActiveTab('users')}>
                <Users size={14} /> Manage Host Accounts
              </button>
              <button className="creator-quick-btn" onClick={() => setActiveTab('cloud')}>
                <FolderSync size={14} /> Configure Google Drive Cloud Backup
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: SESSIONS & MASTER EXPORTS */}
        {activeTab === 'sessions' && (
          <div className="card-panel" style={{ flex: 1, minHeight: 0 }}>
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileAudio size={16} className="daw-logo-icon" />
                <span>RECORDED PODCAST SESSIONS & MASTER STEM EXPORTS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span className="tag">{sessions.length} SESSIONS LOGGED</span>
                {sessions.length > 0 && (
                  <>
                    <button
                      className="creator-quick-btn"
                      onClick={() => handlePurgeOldSessions(30)}
                      title="Purge sessions older than 30 days"
                    >
                      <Database size={12} /> Purge &gt;30d
                    </button>
                    <button
                      className="creator-quick-btn"
                      onClick={handleExportCombinedCSV}
                      title="Export All Sessions as Spreadsheet CSV"
                    >
                      <FileSpreadsheet size={12} /> Export CSV
                    </button>
                    <button
                      className="creator-quick-btn"
                      onClick={handleExportCombinedJSON}
                      title="Export Combined Technical Metadata for All Sessions as JSON"
                    >
                      <FileCode size={12} /> Meta (JSON)
                    </button>
                    <button
                      className="creator-quick-btn active-cyan"
                      onClick={handleExportCombinedTXT}
                      title="Export Aggregated Text Report for All Sessions"
                    >
                      <Download size={12} /> Report (.TXT)
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Search & Filter Bar */}
            {sessions.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-dim)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px', background: 'var(--bg-darkest)', borderRadius: '6px', padding: '0 10px', border: '1px solid var(--border-dim)' }}>
                  <Search size={13} color="var(--text-muted)" />
                  <input
                    className="daw-input"
                    style={{ border: 'none', background: 'transparent', padding: '6px 0', fontSize: '0.75rem', height: '30px' }}
                    placeholder="Filter sessions by title, host, guest or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="daw-select"
                  style={{ width: '140px', height: '30px', fontSize: '0.72rem', padding: '2px 8px' }}
                  value={filterFormat}
                  onChange={(e) => setFilterFormat(e.target.value)}
                >
                  <option value="all">All Formats</option>
                  <option value="wav">WAV Formats</option>
                  <option value="float">32-Bit Float</option>
                </select>
              </div>
            )}

            <div className="admin-table-wrap">
              {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No recorded podcast sessions logged yet. When Hosts record in the Studio, their sessions will appear here with full technical metadata, stem downloads, and Google Drive sync.
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>PREVIEW</th>
                      <th>SESSION TITLE</th>
                      <th>HOST SPEAKER</th>
                      <th>GUEST SPEAKER</th>
                      <th>DURATION</th>
                      <th>GOOGLE DRIVE</th>
                      <th>DATE RECORDED</th>
                      <th>FORMAT</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions
                      .filter((s) => {
                        const q = (searchQuery || '').toLowerCase();
                        const matchesQuery =
                          !q ||
                          (s.title || '').toLowerCase().includes(q) ||
                          (s.hostName || '').toLowerCase().includes(q) ||
                          (s.guestName || '').toLowerCase().includes(q) ||
                          (s.hostEmail || '').toLowerCase().includes(q);
                        const matchesFormat = filterFormat === 'all' || (s.format || '').toLowerCase().includes(filterFormat.toLowerCase());
                        return matchesQuery && matchesFormat;
                      })
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            <button
                              className={`creator-quick-btn ${previewingSession?.id === s.id ? 'active-cyan' : ''}`}
                              style={{ padding: '4px 8px', height: '26px' }}
                              onClick={() => handleTogglePreviewAudio(s)}
                              title={previewingSession?.id === s.id && auditionIsPlaying ? 'Pause Audition' : 'Audition / Preview Session Audio'}
                            >
                              {previewingSession?.id === s.id && auditionIsPlaying ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            <div>{s.title}</div>
                            {driveUploadMessage?.id === s.id && (
                              <div style={{ fontSize: '0.68rem', marginTop: '2px', color: driveUploadMessage.success ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                {driveUploadMessage.text}{' '}
                                {driveUploadMessage.url && (
                                  <a href={driveUploadMessage.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent-green)' }}>
                                    Open Drive File ↗
                                  </a>
                                )}
                              </div>
                            )}
                          </td>
                          <td>{s.hostName}</td>
                          <td style={{ color: 'var(--accent-amber)' }}>{s.guestName}</td>
                          <td style={{ minWidth: '100px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent-cyan)',
                              fontWeight: 700,
                              background: 'rgba(2, 132, 199, 0.1)',
                              border: '1px solid var(--border-dim)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                            }}>
                              <Clock size={11} color="var(--accent-cyan)" />
                              <span>{formatDuration(s.durationSeconds)}</span>
                            </div>
                          </td>
                          <td>
                            {uploadingSessionId === s.id ? (
                              <div style={{ minWidth: '130px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>
                                  <Loader2 size={11} className="animate-spin" />
                                  <span>Syncing ({uploadProgressMap[s.id]?.progress || 0}%)</span>
                                </div>
                                <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '3px' }}>
                                  <div style={{ width: `${uploadProgressMap[s.id]?.progress || 0}%`, height: '100%', background: 'var(--accent-cyan)', borderRadius: '3px', transition: 'width 0.3s' }} />
                                </div>
                              </div>
                            ) : s.driveFileUrl ? (
                              <a
                                href={s.driveFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  background: 'rgba(0, 255, 135, 0.12)',
                                  color: 'var(--accent-green)',
                                  border: '1px solid rgba(0, 255, 135, 0.3)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  borderRadius: '6px',
                                  textDecoration: 'none',
                                }}
                                title="Open audio file in Google Drive"
                              >
                                <CheckCircle size={12} /> Google Drive ↗
                              </a>
                            ) : (
                              <button
                                className="creator-quick-btn"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '0.7rem',
                                  borderColor: 'rgba(255, 183, 0, 0.35)',
                                  color: 'var(--accent-amber)',
                                }}
                                onClick={() => handleUploadSessionToDrive(s)}
                                title="Upload this session audio to Google Drive"
                              >
                                <CloudUpload size={12} /> Sync Drive
                              </button>
                            )}
                          </td>
                          <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {new Date(s.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ fontSize: '0.7rem' }}>
                            <span className="daw-badge">{s.format}</span>
                            {s.fileSizeMb ? (
                              <span style={{ marginLeft: '4px', color: 'var(--text-muted)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
                                {s.fileSizeMb}MB
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="creator-quick-btn"
                                onClick={() => setSelectedSessionForMetadata(s)}
                                title="Inspect Full Technical Audio Metadata"
                              >
                                <FileCode size={12} /> Meta
                              </button>
                              <button
                                className="creator-quick-btn active-cyan"
                                onClick={() => handleAdminExportSession(s)}
                                title="Export Host Session Audio File (Admin Exclusive)"
                              >
                                <Download size={12} /> Export
                              </button>
                              <button
                                className="creator-quick-btn active-red"
                                onClick={() => handleDeleteSingleSession(s)}
                                title="Delete session and release audio storage"
                                style={{ padding: '4px 6px' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: HOST USER MANAGEMENT */}
        {activeTab === 'users' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
            {/* Host Activity Leaderboard Table */}
            <div className="card-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={16} className="daw-logo-icon" />
                  <span>HOST ACTIVITY & RECORDING LEADERBOARD</span>
                </div>
                <span className="tag">{userReports.length} HOSTS</span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>HOST SPEAKER</th>
                      <th>EMAIL</th>
                      <th>SESSIONS</th>
                      <th>TOTAL DURATION</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userReports.map((report) => {
                      const percent = Math.min(100, (report.totalDurationSeconds / maxDuration) * 100);
                      const userObj = getAllUsers().find((u) => u.id === report.userId);
                      return (
                        <tr key={report.userId}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className={`avatar-circle ${report.role === 'admin' ? 'avatar-admin' : 'avatar-user'}`}>
                                {report.userName.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 600 }}>{report.userName}</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{report.userEmail}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{report.totalSessions}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-green)', fontSize: '0.72rem' }}>
                                {formatDuration(report.totalDurationSeconds)}
                              </div>
                              <div style={{ height: '4px', background: 'var(--bg-surface)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${percent}%`, background: 'var(--accent-green)' }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {userObj && (
                                <button
                                  className="creator-quick-btn"
                                  onClick={() => handleOpenEditUser(userObj)}
                                  title="Edit Host Details & Reset Password"
                                  style={{ padding: '4px 6px' }}
                                >
                                  <Edit2 size={12} />
                                </button>
                              )}
                              {report.userId !== currentUser?.id && (
                                <button
                                  className="btn-icon-danger"
                                  onClick={() => handleDeleteUser(report.userId)}
                                  title="Delete Host Account"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create New Host Account Form */}
            <div className="card-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={16} className="daw-logo-icon" />
                  <span>CREATE NEW HOST ACCOUNT</span>
                </div>
              </div>

              <form onSubmit={handleCreateHost} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Admin generates credentials for Hosts. Hosts log in to run dual-channel podcast recording sessions and invite guests.
                </p>

                {addError && (
                  <div className="login-error" style={{ margin: 0 }}>
                    <AlertCircle size={14} /> <span>{addError}</span>
                  </div>
                )}
                {addSuccess && (
                  <div className="login-success">
                    <CheckCircle size={14} /> <span>{addSuccess}</span>
                  </div>
                )}

                <div className="login-field">
                  <label>HOST FULL NAME</label>
                  <input
                    className="daw-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Sarah Connor"
                  />
                </div>

                <div className="login-field">
                  <label>HOST EMAIL ADDRESS</label>
                  <input
                    className="daw-input"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="host@studio.local"
                  />
                </div>

                <div className="login-field">
                  <label>SET INITIAL PASSWORD</label>
                  <input
                    className="daw-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Password for Host"
                  />
                </div>

                <button type="submit" className="creator-record-btn btn-rec-start" style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}>
                  <UserPlus size={14} /> Create Host Account
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: GOOGLE DRIVE CLOUD STORAGE */}
        {activeTab === 'cloud' && (
          <div style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
            <div className="card-panel" style={{ border: '1px solid rgba(0, 255, 135, 0.25)' }}>
              <div className="card-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderSync size={16} color="var(--accent-green)" />
                  <span style={{ color: 'var(--accent-green)' }}>GOOGLE DRIVE STORAGE INTEGRATION</span>
                </div>
                <button
                  className="creator-quick-btn"
                  onClick={() => setShowScriptGuideModal(true)}
                  title="How to connect Google Drive without API keys in 1 minute"
                >
                  <HelpCircle size={12} /> 1-Minute Setup Guide
                </button>
              </div>

              <form onSubmit={handleSaveDriveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Automatically save all recorded podcast WAV files directly to your personal or organization Google Drive folder using a free Google Apps Script webhook.
                </p>

                {driveSaveSuccess && (
                  <div className="login-success" style={{ margin: '2px 0', padding: '6px 8px' }}>
                    <CheckCircle size={13} /> <span>Google Drive settings saved!</span>
                  </div>
                )}

                <div className="login-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>APPS SCRIPT WEBHOOK URL</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {driveWebhookUrl && <span style={{ color: 'var(--accent-green)', fontSize: '0.65rem' }}>● CONFIGURED</span>}
                      <button
                        type="button"
                        className="creator-quick-btn active-cyan"
                        onClick={handleTestDriveConnection}
                        disabled={testingDriveConnection}
                        style={{ height: '22px', fontSize: '0.68rem', padding: '0 8px' }}
                      >
                        {testingDriveConnection ? <><Loader2 size={11} className="animate-spin" /> Testing...</> : <><Zap size={11} /> Test Connection</>}
                      </button>
                    </div>
                  </div>
                  <input
                    className="daw-input"
                    value={driveWebhookUrl}
                    onChange={(e) => setDriveWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                </div>

                {/* Test Connection Result Box */}
                {testDriveResult && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    background: testDriveResult.success ? 'rgba(0, 255, 135, 0.1)' : 'rgba(255, 42, 95, 0.1)',
                    border: `1px solid ${testDriveResult.success ? 'rgba(0, 255, 135, 0.3)' : 'rgba(255, 42, 95, 0.3)'}`,
                    color: testDriveResult.success ? 'var(--accent-green)' : 'var(--accent-red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    {testDriveResult.success ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                    <span>{testDriveResult.message}</span>
                  </div>
                )}

                <div className="login-field">
                  <label>GOOGLE DRIVE FOLDER LINK (OPTIONAL)</label>
                  <input
                    className="daw-input"
                    value={driveFolderUrl}
                    onChange={(e) => setDriveFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer', margin: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={autoUploadDrive}
                    onChange={(e) => setAutoUploadDriveState(e.target.checked)}
                    style={{ accentColor: 'var(--accent-green)' }}
                  />
                  <span>Auto-upload audio to Google Drive when any Host completes recording</span>
                </label>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button type="submit" className="creator-quick-btn active-cyan" style={{ flex: 1, height: '34px', justifyContent: 'center' }}>
                    <CloudUpload size={14} /> Save Cloud Settings
                  </button>
                  <button
                    type="button"
                    className="creator-quick-btn"
                    onClick={() => setShowScriptGuideModal(true)}
                    title="Get Google Apps Script Code"
                    style={{ height: '34px' }}
                  >
                    <FileCode size={14} /> Copy Apps Script Code
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Floating Audio Audition Player Dock (When previewing any session) */}
      {previewingSession && (
        <div className="floating-audition-dock">
          {/* Left: Play/Pause and Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="creator-quick-btn active-cyan"
              style={{ width: '36px', height: '36px', borderRadius: '50%', padding: 0, justifyContent: 'center' }}
              onClick={() => handleTogglePreviewAudio(previewingSession)}
            >
              {auditionIsPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="audition-track-info">
              <div className="audition-track-title">{previewingSession.title}</div>
              <div className="audition-track-sub">
                {previewingSession.hostName} & {previewingSession.guestName}
              </div>
            </div>
          </div>

          {/* Center: Waveform Scrubber & Timecode */}
          <div className="audition-scrub-section">
            <div className="audition-timecode">
              {formatDuration(Math.floor(auditionCurrentTime))} / {formatDuration(Math.floor(auditionDuration))}
            </div>
            <input
              type="range"
              className="audition-scrubber-slider"
              min={0}
              max={auditionDuration || 1}
              step={0.1}
              value={auditionCurrentTime}
              onChange={(e) => handleAuditionSeek(parseFloat(e.target.value))}
            />
          </div>

          {/* Right: Playback Speed & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              className="daw-select"
              style={{ width: '70px', height: '28px', fontSize: '0.72rem', padding: '2px 4px' }}
              value={auditionSpeed}
              onChange={(e) => handleAuditionSpeedChange(parseFloat(e.target.value))}
            >
              <option value="1.0">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2.0">2.0x</option>
            </select>

            <button
              className="creator-quick-btn"
              onClick={handleCloseAudition}
              title="Close Audition Player"
              style={{ padding: '4px' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Edit Host & Password Reset Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="var(--accent-cyan)" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>EDIT HOST / RESET PASSWORD</h3>
              </div>
              <button onClick={() => setEditingUser(null)} className="btn-icon" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Account Email: <strong style={{ color: 'var(--accent-cyan)' }}>{editingUser.email}</strong>
              </div>

              {editUserMsg && (
                <div className={editUserMsg.type === 'success' ? 'login-success' : 'login-error'} style={{ margin: '4px 0' }}>
                  {editUserMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <span>{editUserMsg.text}</span>
                </div>
              )}

              <div className="login-field">
                <label>HOST DISPLAY NAME</label>
                <input
                  className="daw-input"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  placeholder="Host Name"
                  required
                />
              </div>

              <div className="login-field">
                <label>NEW PASSWORD (LEAVE BLANK TO KEEP CURRENT)</label>
                <input
                  className="daw-input"
                  type="password"
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="creator-quick-btn" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="creator-quick-btn active-cyan">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Apps Script 1-Minute Setup Guide Modal */}
      {showScriptGuideModal && (
        <div className="modal-overlay" onClick={() => setShowScriptGuideModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderSync color="var(--accent-green)" size={20} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>GOOGLE DRIVE AUDIO UPLOAD SETUP (NO API KEY NEEDED)</h3>
              </div>
              <button onClick={() => setShowScriptGuideModal(false)} className="btn-icon" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Step 1:</strong> Open your Google Drive folder and copy the <code style={{ color: 'var(--accent-cyan)' }}>FOLDER_ID</code> from the browser URL (the characters after <code style={{ color: 'var(--accent-cyan)' }}>/folders/</code>).
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Step 2:</strong> Go to <a href="https://script.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-green)', textDecoration: 'underline' }}>script.google.com</a> and click <strong>New project</strong>.
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Step 3:</strong> Replace all code in the editor with the script below and replace <code style={{ color: 'var(--accent-cyan)' }}>YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE</code> with your Folder ID.
              </div>

              <div style={{ position: 'relative', background: 'var(--bg-darker)', border: '1px solid var(--border-dim)', borderRadius: '6px', padding: '12px' }}>
                <button
                  className="creator-quick-btn active-cyan"
                  onClick={handleCopyAppsScript}
                  style={{ position: 'absolute', top: '8px', right: '8px' }}
                >
                  {copiedScript ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Script Code</>}
                </button>
                <pre style={{ margin: 0, maxHeight: '200px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-green)', lineHeight: 1.4 }}>
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>

              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Step 4:</strong> Click <strong>Deploy</strong> → <strong>New deployment</strong> → Type: <strong>Web app</strong> → Execute as: <strong>Me</strong> → Who has access: <strong>Anyone</strong> → Click <strong>Deploy</strong>.
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Step 5:</strong> Copy the generated <strong>Web app URL</strong> and paste it into the <strong>APPS SCRIPT WEBHOOK URL</strong> input field!
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="creator-quick-btn active-cyan" onClick={() => setShowScriptGuideModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Metadata Modal */}
      {selectedSessionForMetadata && (
        <AudioMetadataModal
          session={selectedSessionForMetadata}
          onClose={() => setSelectedSessionForMetadata(null)}
          onExportAudio={handleAdminExportSession}
        />
      )}

      {/* Admin Audio Export Modal */}
      {exportModalSession && (
        <ExportModal
          audioBuffer={exportModalSession.audioBuffer}
          speakerABuffer={exportModalSession.speakerABuffer}
          speakerBBuffer={exportModalSession.speakerBBuffer}
          onClose={() => setExportModalSession(null)}
        />
      )}

      {/* Hidden Audio Element for Auditioning Session Audio */}
      <audio
        ref={previewAudioRef}
        style={{ display: 'none' }}
      />

      {/* Google Drive Upload Success / Error Notification Modal Popup */}
      {drivePopupModal && (
        <DriveUploadNotificationModal
          type={drivePopupModal.type}
          title={drivePopupModal.title}
          message={drivePopupModal.message}
          fileUrl={drivePopupModal.fileUrl}
          error={drivePopupModal.error}
          sessionTitle={drivePopupModal.sessionTitle}
          onClose={() => setDrivePopupModal(null)}
          onRetry={
            drivePopupModal.retrySession
              ? () => {
                  const s = drivePopupModal.retrySession!;
                  setDrivePopupModal(null);
                  handleUploadSessionToDrive(s);
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
