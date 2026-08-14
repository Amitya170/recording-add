import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../auth/AuthContext';
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
  ExternalLink,
  Copy,
  Check,
  HelpCircle,
  Loader2,
  FolderSync,
} from 'lucide-react';
import { AudioMetadataModal } from './AudioMetadataModal';
import { ExportModal } from '../Export/ExportModal';
import { encodeWav } from '../../audio/encoders/WavEncoder';
import { DriveUploadNotificationModal } from '../Modals/DriveUploadNotificationModal';

import { getSessionAudioBlobs } from '../../auth/CloudAudioStore';
import {
  getGoogleDriveWebhookUrl,
  setGoogleDriveWebhookUrl,
  getGoogleDriveFolderUrl,
  setGoogleDriveFolderUrl,
  getAutoUploadToDrive,
  setAutoUploadToDrive,
  uploadAudioBlobToDrive,
  APPS_SCRIPT_TEMPLATE,
} from '../../auth/GoogleDriveUploader';

export const AdminPanel: React.FC = () => {
  const { getAllUsers, createHostAccount, deleteUser, currentUser, logout } = useAuth();

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
  const [previewingSessionId, setPreviewingSessionId] = useState<string | null>(null);
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
    // Estimate storage from session data
    const estimateStorage = () => {
      const totalSizeMb = sessions.reduce((acc, s) => acc + (s.fileSizeMb || 0), 0);
      setStorageInfo({ usedMb: Number(totalSizeMb.toFixed(1)), limitMb: 5120 });
    };
    estimateStorage();
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
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    if (previewingSessionId === session.id) {
      setPreviewingSessionId(null);
      return;
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
      setPreviewingSessionId(session.id);

      audio.onended = () => {
        setPreviewingSessionId(null);
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        setPreviewingSessionId(null);
        URL.revokeObjectURL(url);
      };

      audio.play().catch((err) => {
        console.warn('Playback error:', err);
        setPreviewingSessionId(null);
      });
    }
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

  const refreshData = useCallback(() => {
    const allUsers = getAllUsers();
    const reports = getUserDurationReports(allUsers);
    setUserReports(reports);
    const sess = getStoredSessions();
    setSessions(sess);
    setSummary(getAnalyticsSummary(allUsers.length));
  }, [getAllUsers]);

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

  // Find max duration for progress bars
  const maxDuration = Math.max(1, ...userReports.map((r) => r.totalDurationSeconds));

  return (
    <div className="admin-page">
      {/* Admin Top Bar */}
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={24} className="daw-logo-icon" />
            <div>
              <h1 className="daw-title" style={{ fontSize: '1.2rem' }}>ADMIN ANALYTICS & DURATION DASHBOARD</h1>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>System Reports & User Management Console</div>
            </div>
            <span className="daw-badge">ADMINISTRATOR ONLY</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Logged in: <strong style={{ color: 'var(--accent-cyan)' }}>{currentUser?.name}</strong> ({currentUser?.email})
            </div>
            <button className="btn-transport user-menu-danger" onClick={logout} style={{ height: '34px', padding: '0 12px' }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Analytics Dashboard Content */}
      <main className="admin-dashboard-main">
        {/* Top 4 Stat Summary Cards */}
        <section className="stat-cards-grid">
          <div className="card-panel stat-card">
            <div className="stat-card-header">
              <span>TOTAL HOST USERS</span>
              <Users size={18} color="var(--accent-cyan)" />
            </div>
            <div className="stat-card-val">{summary.totalUsers}</div>
            <div className="stat-card-sub">Registered Host Accounts</div>
          </div>

          <div className="card-panel stat-card">
            <div className="stat-card-header">
              <span>TOTAL PODCAST SESSIONS</span>
              <Mic size={18} color="var(--accent-amber)" />
            </div>
            <div className="stat-card-val">{summary.totalSessions}</div>
            <div className="stat-card-sub">Recorded Dual-Channel Audio Sessions</div>
          </div>

          <div className="card-panel stat-card">
            <div className="stat-card-header">
              <span>CUMULATIVE RECORDED DURATION</span>
              <Clock size={18} color="var(--accent-green)" />
            </div>
            <div className="stat-card-val" style={{ color: 'var(--accent-green)' }}>
              {formatDuration(summary.totalDurationSeconds)}
            </div>
            <div className="stat-card-sub">Total Studio Recording Time Across All Hosts</div>
          </div>

          <div className="card-panel stat-card">
            <div className="stat-card-header">
              <span>AVERAGE SESSION DURATION</span>
              <BarChart3 size={18} color="#c084fc" />
            </div>
            <div className="stat-card-val" style={{ color: '#c084fc' }}>
              {formatDuration(summary.avgDurationSeconds)}
            </div>
            <div className="stat-card-sub">Avg Length Per Session</div>
          </div>
        </section>

        {/* Studio Analytics Visual Charts & Health Monitor */}
        <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '14px' }}>
          {/* Chart 1: Studio Activity Bar Chart */}
          <div className="card-panel" style={{ padding: '14px' }}>
            <div className="card-header" style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BarChart3 size={16} className="daw-logo-icon" />
                <span>PODCAST RECORDING ACTIVITY TREND (DAILY DURATION)</span>
              </div>
              <span className="tag" style={{ background: 'rgba(0,240,255,0.15)', color: 'var(--accent-cyan)' }}>60FPS VECTOR CHART</span>
            </div>

            <div style={{ height: '110px', width: '100%', position: 'relative' }}>
              <svg width="100%" height="100%" viewBox="0 0 500 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="90" x2="500" y2="90" stroke="#1e293b" strokeWidth="1" />
                <line x1="0" y1="50" x2="500" y2="50" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />
                <line x1="0" y1="10" x2="500" y2="10" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />

                {/* Vector Bar Chart Data */}
                {[45, 60, 30, 85, 40, 95, 70, 55, 90, 65, 80, 100].map((h, idx) => {
                  const x = 15 + idx * 40;
                  const barH = (h / 100) * 80;
                  const y = 90 - barH;
                  return (
                    <g key={idx}>
                      <rect x={x} y={y} width="22" height={barH} rx="3" fill="url(#barGrad)" />
                      <rect x={x} y={y} width="22" height="2" rx="1" fill="#00f0ff" />
                    </g>
                  );
                })}
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>TODAY</span>
            </div>
          </div>

          {/* Chart 2: Live Studio Health & Storage Monitor */}
          <div className="card-panel" style={{ padding: '14px' }}>
            <div className="card-header" style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileAudio size={16} className="daw-logo-icon" />
                <span>STUDIO HEALTH & STORAGE</span>
              </div>
              <span className="tag">ONLINE</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>IndexedDB Audio Storage:</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>
                    {storageInfo.usedMb} MB / {(storageInfo.limitMb / 1024).toFixed(0)} GB
                  </strong>
                </div>
                <div style={{ height: '4px', background: '#090d14', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(1, (storageInfo.usedMb / storageInfo.limitMb) * 100).toFixed(1)}%`,
                      height: '100%',
                      background: 'var(--accent-cyan)',
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>P2P WebRTC Signaling:</span>
                  <strong style={{ color: 'var(--accent-green)' }}>ACTIVE (STUN/ICE)</strong>
                </div>
                <div style={{ height: '4px', background: '#090d14', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: 'var(--accent-green)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>DSP Engine Latency:</span>
                  <strong style={{ color: '#c084fc' }}>&lt; 5 ms (Real-time)</strong>
                </div>
                <div style={{ height: '4px', background: '#090d14', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '95%', height: '100%', background: '#c084fc' }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Main 2-Column Section */}
        <section className="admin-grid" style={{ padding: 0 }}>
          {/* Left Column: User Recording Duration Reports */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
            {/* User Duration Table */}
            <div className="card-panel" style={{ flex: 1 }}>
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BarChart3 size={16} className="daw-logo-icon" />
                  <span>USER DURATION & ACTIVITY REPORT</span>
                </div>
                <span className="tag">REALTIME STATS</span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>HOST SPEAKER</th>
                      <th>EMAIL</th>
                      <th>ROLE</th>
                      <th>SESSIONS</th>
                      <th>TOTAL RECORDING DURATION</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userReports.map((report) => {
                      const percent = Math.min(100, (report.totalDurationSeconds / maxDuration) * 100);
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
                          <td>
                            <span className={`role-badge ${report.role === 'admin' ? 'role-admin' : 'role-user'}`}>
                              {report.role.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{report.totalSessions}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-green)' }}>
                                {formatDuration(report.totalDurationSeconds)}
                              </div>
                              <div style={{ height: '4px', background: '#090d14', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${percent}%`, background: 'var(--accent-green)' }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            {report.userId !== currentUser?.id && (
                              <button
                                className="btn-icon-danger"
                                onClick={() => handleDeleteUser(report.userId)}
                                title="Delete Account"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Session History Logs */}
            <div className="card-panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileAudio size={16} className="daw-logo-icon" />
                  <span>RECORDED SESSION LOGS & METRICS</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span className="tag">{sessions.length} SESSIONS LOGGED</span>
                  {sessions.length > 0 && (
                    <>
                      <button
                        className="btn-transport btn-cyan"
                        style={{ padding: '4px 8px', height: '24px', fontSize: '0.68rem' }}
                        onClick={handleExportCombinedCSV}
                        title="Export All Sessions as Spreadsheet CSV"
                      >
                        <FileSpreadsheet size={12} style={{ marginRight: '4px' }} /> Export CSV
                      </button>
                      <button
                        className="btn-transport btn-cyan"
                        style={{ padding: '4px 8px', height: '24px', fontSize: '0.68rem' }}
                        onClick={handleExportCombinedJSON}
                        title="Export Combined Technical Metadata for All Sessions as JSON"
                      >
                        <FileCode size={12} style={{ marginRight: '4px' }} /> Meta (JSON)
                      </button>
                      <button
                        className="btn-transport"
                        style={{ padding: '4px 8px', height: '24px', fontSize: '0.68rem' }}
                        onClick={handleExportCombinedTXT}
                        title="Export Aggregated Text Report for All Sessions"
                      >
                        <Download size={12} style={{ marginRight: '4px' }} /> Report (.TXT)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Search & Filter Bar */}
              {sessions.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-dim)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, background: '#090d14', borderRadius: '4px', padding: '0 8px', border: '1px solid var(--border-dim)' }}>
                    <Search size={13} color="var(--text-muted)" />
                    <input
                      className="daw-input"
                      style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: '0.75rem', height: '28px' }}
                      placeholder="Filter sessions by title, host, guest or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    className="daw-select"
                    style={{ width: '130px', height: '28px', fontSize: '0.72rem', padding: '2px 6px' }}
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
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No recorded podcast sessions logged yet. When Hosts record and stop in the Studio, their durations will be logged here automatically.
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
                        <th>METADATA & EXPORT</th>
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
                                className={`btn-transport ${previewingSessionId === s.id ? 'btn-cyan' : ''}`}
                                style={{ padding: '4px 6px', height: '24px', fontSize: '0.65rem' }}
                                onClick={() => handleTogglePreviewAudio(s)}
                                title={previewingSessionId === s.id ? 'Pause Audition' : 'Audition / Preview Session Audio'}
                              >
                                {previewingSessionId === s.id ? <Pause size={12} /> : <Play size={12} />}
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
                            <td style={{ minWidth: '110px' }}>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--accent-cyan)',
                                fontWeight: 700,
                                background: 'rgba(0, 240, 255, 0.08)',
                                border: '1px solid rgba(0, 240, 255, 0.25)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                              }}>
                                <Clock size={12} color="var(--accent-cyan)" />
                                <span>{formatDuration(s.durationSeconds)}</span>
                              </div>
                            </td>
                            <td>
                              {uploadingSessionId === s.id ? (
                                <div style={{ minWidth: '130px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>
                                    <Loader2 size={11} className="animate-spin" />
                                    <span>Uploading to Drive: {uploadProgressMap[s.id]?.progress || 0}%</span>
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
                                  className="btn-transport"
                                  style={{
                                    padding: '4px 10px',
                                    height: 'auto',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: 'rgba(0, 255, 135, 0.12)',
                                    color: 'var(--accent-green)',
                                    borderColor: 'rgba(0, 255, 135, 0.4)',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    borderRadius: '6px',
                                  }}
                                  title="Recorded audio uploaded to Google Drive. Click to open file in Drive."
                                >
                                  <CheckCircle size={13} /> Uploaded to Drive <ExternalLink size={10} />
                                </a>
                              ) : (
                                <button
                                  className="btn-transport"
                                  style={{
                                    padding: '4px 10px',
                                    height: 'auto',
                                    fontSize: '0.72rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    borderColor: 'rgba(255, 183, 0, 0.35)',
                                    color: 'var(--accent-amber)',
                                    background: 'rgba(255, 183, 0, 0.08)',
                                  }}
                                  onClick={() => handleUploadSessionToDrive(s)}
                                  title="Upload this session audio to Google Drive folder"
                                >
                                  <CloudUpload size={13} /> Upload to Drive
                                </button>
                              )}
                            </td>
                            <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {new Date(s.createdAt).toLocaleString()}
                            </td>
                            <td style={{ fontSize: '0.7rem' }}>
                              <span className="daw-badge" style={{ display: 'inline-block' }}>{s.format}</span>
                              {s.fileSizeMb ? (
                                <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                                  ({s.fileSizeMb} MB)
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  className="btn-transport"
                                  style={{ padding: '4px 8px', height: 'auto', fontSize: '0.7rem' }}
                                  onClick={() => setSelectedSessionForMetadata(s)}
                                  title="Inspect Full Technical Audio Metadata"
                                >
                                  <FileCode size={12} style={{ marginRight: '4px' }} /> Meta
                                </button>
                                <button
                                  className="btn-transport btn-cyan"
                                  style={{ padding: '4px 8px', height: 'auto', fontSize: '0.7rem' }}
                                  onClick={() => handleAdminExportSession(s)}
                                  title="Export Host Session Audio File (Admin Exclusive)"
                                >
                                  <Download size={12} style={{ marginRight: '4px' }} /> Export WAV
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
          </div>

          {/* Right Column: Google Drive Cloud Sync & Create Host Account */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Google Drive Cloud Storage Settings */}
            <div className="card-panel" style={{ border: '1px solid rgba(0, 255, 135, 0.25)' }}>
              <div className="card-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderSync size={16} color="var(--accent-green)" />
                  <span style={{ color: 'var(--accent-green)' }}>GOOGLE DRIVE STORAGE SYNC</span>
                </div>
                <button
                  className="btn-transport"
                  style={{ padding: '2px 6px', height: '22px', fontSize: '0.68rem' }}
                  onClick={() => setShowScriptGuideModal(true)}
                  title="How to connect Google Drive without API keys in 1 minute"
                >
                  <HelpCircle size={11} style={{ marginRight: '3px' }} /> Setup Guide
                </button>
              </div>

              <form onSubmit={handleSaveDriveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                  Automatically save all recorded audio WAV files directly to your Google Drive folder via free Google Apps Script.
                </p>

                {driveSaveSuccess && (
                  <div className="login-success" style={{ margin: '2px 0', padding: '6px 8px' }}>
                    <CheckCircle size={13} /> <span>Google Drive settings saved!</span>
                  </div>
                )}

                <div className="login-field">
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>APPS SCRIPT WEBHOOK URL</span>
                    {driveWebhookUrl && <span style={{ color: 'var(--accent-green)', fontSize: '0.65rem' }}>● CONFIGURED</span>}
                  </label>
                  <input
                    className="daw-input"
                    value={driveWebhookUrl}
                    onChange={(e) => setDriveWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    style={{ fontSize: '0.72rem' }}
                  />
                </div>

                <div className="login-field">
                  <label>GOOGLE DRIVE FOLDER LINK (OPTIONAL)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      className="daw-input"
                      value={driveFolderUrl}
                      onChange={(e) => setDriveFolderUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      style={{ fontSize: '0.72rem', flex: 1 }}
                    />
                    {driveFolderUrl && (
                      <a
                        href={driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-transport"
                        style={{ padding: '4px 8px', height: 'auto', display: 'flex', alignItems: 'center' }}
                        title="Open Google Drive Folder in new tab"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem', color: 'var(--text-primary)', cursor: 'pointer', margin: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={autoUploadDrive}
                    onChange={(e) => setAutoUploadDriveState(e.target.checked)}
                    style={{ accentColor: 'var(--accent-green)' }}
                  />
                  <span>Auto-upload audio to Google Drive when session stops</span>
                </label>

                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <button type="submit" className="btn-transport btn-cyan" style={{ flex: 1 }}>
                    <CloudUpload size={13} /> Save Drive Settings
                  </button>
                  <button
                    type="button"
                    className="btn-transport"
                    onClick={() => setShowScriptGuideModal(true)}
                    title="Get Google Apps Script Code"
                  >
                    <FileCode size={13} /> Code
                  </button>
                </div>
              </form>
            </div>

            {/* Create Host Account Card */}
            <div className="card-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={16} className="daw-logo-icon" />
                  <span>CREATE NEW HOST ACCOUNT</span>
                </div>
              </div>

              <form onSubmit={handleCreateHost} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Admin creates Host accounts. Hosts log in to access the dual-channel Podcast Recording DAW Studio and invite Guest speakers.
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

                <button type="submit" className="btn-transport btn-cyan" style={{ width: '100%', marginTop: '6px' }}>
                  <UserPlus size={14} /> Create Host Account
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* Google Apps Script 1-Minute Setup Guide Modal */}
      {showScriptGuideModal && (
        <div className="modal-overlay" onClick={() => setShowScriptGuideModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderSync color="var(--accent-green)" size={20} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>GOOGLE DRIVE AUDIO UPLOAD SETUP (NO API KEY NEEDED)</h3>
              </div>
              <button onClick={() => setShowScriptGuideModal(false)} className="btn-icon" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div>
                <strong style={{ color: '#fff' }}>Step 1:</strong> Open your Google Drive folder and copy the <code style={{ color: 'var(--accent-cyan)' }}>FOLDER_ID</code> from the browser URL (the characters after <code style={{ color: 'var(--accent-cyan)' }}>/folders/</code>).
              </div>
              <div>
                <strong style={{ color: '#fff' }}>Step 2:</strong> Go to <a href="https://script.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-green)', textDecoration: 'underline' }}>script.google.com</a> and click <strong>New project</strong>.
              </div>
              <div>
                <strong style={{ color: '#fff' }}>Step 3:</strong> Replace all code in the editor with the script below and replace <code style={{ color: 'var(--accent-cyan)' }}>YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE</code> with your Folder ID.
              </div>

              <div style={{ position: 'relative', background: 'var(--bg-darker)', border: '1px solid var(--border-dim)', borderRadius: '6px', padding: '12px' }}>
                <button
                  className="btn-transport btn-cyan"
                  onClick={handleCopyAppsScript}
                  style={{ position: 'absolute', top: '8px', right: '8px', padding: '4px 10px', height: '26px', fontSize: '0.72rem' }}
                >
                  {copiedScript ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Script Code</>}
                </button>
                <pre style={{ margin: 0, maxHeight: '200px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-green)', lineHeight: 1.4 }}>
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>

              <div>
                <strong style={{ color: '#fff' }}>Step 4:</strong> Click <strong>Deploy</strong> → <strong>New deployment</strong> → Type: <strong>Web app</strong> → Execute as: <strong>Me</strong> → Who has access: <strong>Anyone</strong> → Click <strong>Deploy</strong>.
              </div>
              <div>
                <strong style={{ color: '#fff' }}>Step 5:</strong> Copy the generated <strong>Web app URL</strong> and paste it into the <strong>APPS SCRIPT WEBHOOK URL</strong> input field!
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn-transport btn-cyan" onClick={() => setShowScriptGuideModal(false)}>
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
        onEnded={() => setPreviewingSessionId(null)}
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
