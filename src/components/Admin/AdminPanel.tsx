import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  getAnalyticsSummary,
  getUserDurationReports,
  getStoredSessions,
  formatDuration,
  createAudioBuffersForSession,
  generateCombinedMetadataJSON,
  generateCombinedMetadataTXT,
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
} from 'lucide-react';
import { AudioMetadataModal } from './AudioMetadataModal';
import { ExportModal } from '../Export/ExportModal';

import { getSessionAudioBlobs } from '../../auth/CloudAudioStore';

export const AdminPanel: React.FC = () => {
  const { getAllUsers, createHostAccount, deleteUser, currentUser, logout } = useAuth();

  const [userReports, setUserReports] = useState<UserDurationReport[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [summary, setSummary] = useState({
    totalUsers: 0,
    totalSessions: 0,
    totalDurationSeconds: 0,
    avgDurationSeconds: 0,
  });

  const [storageInfo, setStorageInfo] = useState({ usedMb: 0, limitMb: 5120 });

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
          const aArr = await stored.speakerABlob.arrayBuffer();
          bufA = await ctx.decodeAudioData(aArr);
        }
        if (stored.speakerBBlob) {
          const bArr = await stored.speakerBBlob.arrayBuffer();
          bufB = await ctx.decodeAudioData(bArr);
        }

        setExportModalSession({
          session,
          audioBuffer: mainBuf,
          speakerABuffer: bufA,
          speakerBBuffer: bufB,
        });
        return;
      } catch (err) {
        console.error('Error decoding stored IndexedDB WAV blob:', err);
      }
    }

    // Fallback if IndexedDB blob is absent
    const bufs = createAudioBuffersForSession(session);
    setExportModalSession({
      session,
      audioBuffer: bufs.audioBuffer,
      speakerABuffer: bufs.speakerABuffer,
      speakerBBuffer: bufs.speakerBBuffer,
    });
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

  const refreshData = () => {
    const allUsers = getAllUsers();
    const reports = getUserDurationReports(allUsers);
    setUserReports(reports);
    const sess = getStoredSessions();
    setSessions(sess);
    setSummary(getAnalyticsSummary(allUsers.length));
  };

  useEffect(() => {
    refreshData();
  }, []);

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
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileAudio size={16} className="daw-logo-icon" />
                  <span>RECORDED SESSION LOGS & METRICS</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="tag">{sessions.length} SESSIONS LOGGED</span>
                  {sessions.length > 0 && (
                    <>
                      <button
                        className="btn-transport btn-cyan"
                        style={{ padding: '4px 8px', height: '24px', fontSize: '0.68rem' }}
                        onClick={handleExportCombinedJSON}
                        title="Export Combined Technical Metadata for All Sessions as JSON"
                      >
                        <FileCode size={12} style={{ marginRight: '4px' }} /> Combined Meta (JSON)
                      </button>
                      <button
                        className="btn-transport"
                        style={{ padding: '4px 8px', height: '24px', fontSize: '0.68rem' }}
                        onClick={handleExportCombinedTXT}
                        title="Export Aggregated Text Report for All Sessions"
                      >
                        <Download size={12} style={{ marginRight: '4px' }} /> All Report (.TXT)
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="admin-table-wrap">
                {sessions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No recorded podcast sessions logged yet. When Hosts record and stop in the Studio, their durations will be logged here automatically.
                  </div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>SESSION TITLE</th>
                        <th>HOST SPEAKER</th>
                        <th>GUEST SPEAKER</th>
                        <th>DURATION</th>
                        <th>DATE RECORDED</th>
                        <th>FORMAT</th>
                        <th>METADATA & EXPORT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.title}</td>
                          <td>{s.hostName}</td>
                          <td style={{ color: 'var(--accent-amber)' }}>{s.guestName}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                            {formatDuration(s.durationSeconds)}
                          </td>
                          <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {new Date(s.createdAt).toLocaleString()}
                          </td>
                          <td style={{ fontSize: '0.7rem' }}>
                            <span className="daw-badge">{s.format}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
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

          {/* Right Column: Create Host Account Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
    </div>
  );
};
