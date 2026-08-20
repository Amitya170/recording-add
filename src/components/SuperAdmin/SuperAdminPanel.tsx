import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, type User } from '../../auth/AuthContext';
import {
  Shield,
  Crown,
  Users,
  Mic,
  BarChart3,
  LogOut,
  Trash2,
  Edit2,
  Key,
  UserPlus,
  Building2,
  FileAudio,
  Play,
  Pause,
  FileCode,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  X,
} from 'lucide-react';
import {
  getStoredSessions,
  createAudioBuffersForSession,
  deleteStoredSession,
  purgeOldSessions,
  clearAllSessions,
  formatDuration,
  type RecordingSession,
} from '../../auth/SessionStore';
import { getSessionAudioBlobs, deleteSessionAudioBlobs, clearAllAudioBlobs } from '../../auth/CloudAudioStore';
import { ThemeToggle } from '../Common/ThemeToggle';
import { AudioMetadataModal } from '../Admin/AudioMetadataModal';
import { encodeWav } from '../../audio/encoders/WavEncoder';

export const SuperAdminPanel: React.FC = () => {
  const {
    getAllUsers,
    getAllAdmins,
    createAdminAccount,
    createHostAccount,
    deleteUser,
    updateUser,
    currentUser,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'admins' | 'hosts' | 'sessions'>('overview');
  const [admins, setAdmins] = useState<User[]>([]);
  const [allUsersList, setAllUsersList] = useState<User[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [filterAdminId, setFilterAdminId] = useState<string>('all');
  
  // Audition Player State
  const [previewingSession, setPreviewingSession] = useState<RecordingSession | null>(null);
  const [auditionCurrentTime, setAuditionCurrentTime] = useState(0);
  const [auditionDuration, setAuditionDuration] = useState(0);
  const [auditionIsPlaying, setAuditionIsPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [storageInfo, setStorageInfo] = useState({ usedMb: 0, limitMb: 5120 });
  const [storageActionMsg, setStorageActionMsg] = useState<string | null>(null);

  // Create Admin Form State
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminOrg, setNewAdminOrg] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [adminAddError, setAdminAddError] = useState('');
  const [adminAddSuccess, setAdminAddSuccess] = useState('');

  // Create Host Form State (under specific admin)
  const [newHostName, setNewHostName] = useState('');
  const [newHostEmail, setNewHostEmail] = useState('');
  const [newHostAdminId, setNewHostAdminId] = useState('');
  const [newHostPassword, setNewHostPassword] = useState('');
  const [hostAddError, setHostAddError] = useState('');
  const [hostAddSuccess, setHostAddSuccess] = useState('');

  // Edit User / Admin Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserOrg, setEditUserOrg] = useState('');
  const [editUserAdminId, setEditUserAdminId] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserMsg, setEditUserMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Metadata Modal
  const [selectedSessionForMetadata, setSelectedSessionForMetadata] = useState<RecordingSession | null>(null);

  const refreshData = useCallback(() => {
    const all = getAllUsers();
    setAllUsersList(all);
    const adm = getAllAdmins();
    setAdmins(adm);
    const sess = getStoredSessions();
    setSessions(sess);
  }, [getAllUsers, getAllAdmins]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    const handleStorage = () => refreshData();
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshData]);

  useEffect(() => {
    const checkQuota = async () => {
      let limitMb = 5120;
      let usedMb = Number(sessions.reduce((acc, s) => acc + (s.fileSizeMb || 0), 0).toFixed(1));
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (est.quota) limitMb = Math.round(est.quota / (1024 * 1024));
          if (est.usage) usedMb = Number((est.usage / (1024 * 1024)).toFixed(1));
        } catch {}
      }
      setStorageInfo({ usedMb, limitMb });
    };
    checkQuota();
  }, [sessions]);

  // Create Admin Submit
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAddError('');
    setAdminAddSuccess('');

    if (!newAdminName || !newAdminEmail || !newAdminPassword) {
      setAdminAddError('Name, email, and password are required.');
      return;
    }

    const ok = await createAdminAccount(
      newAdminEmail,
      newAdminName,
      newAdminPassword,
      newAdminOrg || 'Independent Studio Network'
    );

    if (ok) {
      setAdminAddSuccess(`Admin created for ${newAdminEmail} (${newAdminOrg})`);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminOrg('');
      setNewAdminPassword('');
      refreshData();
      setTimeout(() => setAdminAddSuccess(''), 3500);
    } else {
      setAdminAddError('An account with this email already exists.');
    }
  };

  // Create Host Submit
  const handleCreateHost = async (e: React.FormEvent) => {
    e.preventDefault();
    setHostAddError('');
    setHostAddSuccess('');

    if (!newHostName || !newHostEmail || !newHostPassword) {
      setHostAddError('Name, email, and password are required.');
      return;
    }

    const ok = await createHostAccount(
      newHostEmail,
      newHostName,
      newHostPassword,
      newHostAdminId || admins[0]?.id
    );

    if (ok) {
      setHostAddSuccess(`Host created for ${newHostEmail}`);
      setNewHostName('');
      setNewHostEmail('');
      setNewHostPassword('');
      refreshData();
      setTimeout(() => setHostAddSuccess(''), 3500);
    } else {
      setHostAddError('An account with this email already exists.');
    }
  };

  // Edit User / Admin
  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserOrg(user.organizationName || '');
    setEditUserAdminId(user.adminId || '');
    setEditUserPassword('');
    setEditUserMsg(null);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserMsg(null);

    const ok = await updateUser(editingUser.id, {
      name: editUserName,
      organizationName: editingUser.role === 'admin' ? editUserOrg : undefined,
      adminId: editingUser.role === 'host' ? editUserAdminId : undefined,
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

  const handleDeleteUser = (id: string, name: string) => {
    if (id === currentUser?.id) return;
    if (window.confirm(`Are you sure you want to permanently delete "${name}"?`)) {
      deleteUser(id);
      refreshData();
    }
  };

  // Audition Controls
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
      audio.playbackRate = 1.0;

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

      audio.play().catch(() => {
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

  const handleCloseAudition = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingSession(null);
    setAuditionIsPlaying(false);
    setAuditionCurrentTime(0);
  };

  const handleDeleteSingleSession = async (session: RecordingSession) => {
    if (window.confirm(`Delete "${session.title}"? This permanently frees the recorded audio blobs and metadata.`)) {
      if (previewingSession?.id === session.id) handleCloseAudition();
      deleteStoredSession(session.id);
      await deleteSessionAudioBlobs(session.id);
      refreshData();
      setStorageActionMsg(`Deleted session "${session.title}".`);
      setTimeout(() => setStorageActionMsg(null), 3000);
    }
  };

  const totalGlobalDuration = sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const totalHostsCount = allUsersList.filter((u) => u.role === 'host').length;

  return (
    <div className="admin-page">
      {/* Super Admin Top Header */}
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(255, 183, 0, 0.15)',
              border: '1px solid rgba(255, 183, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-amber)',
              boxShadow: '0 0 16px rgba(255, 183, 0, 0.3)',
            }}>
              <Crown size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="daw-title" style={{ fontSize: '1.2rem', fontWeight: 800 }}>SUPER ADMIN COMMAND PORTAL</h1>
                <span className="daw-badge" style={{ color: 'var(--accent-amber)', borderColor: 'rgba(255, 183, 0, 0.4)', background: 'rgba(255, 183, 0, 0.1)' }}>
                  👑 MULTI-TENANT ROOT
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                Global Multi-Organization Governance, Admin Creation & Studio Telemetry
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="admin-nav-tabs">
            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <BarChart3 size={14} />
              <span>Global Overview</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'admins' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('admins')}
            >
              <Shield size={14} />
              <span>Studio Admins</span>
              <span className="admin-tab-badge">{admins.length}</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'hosts' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('hosts')}
            >
              <Users size={14} />
              <span>Global Hosts</span>
              <span className="admin-tab-badge">{totalHostsCount}</span>
            </button>

            <button
              type="button"
              className={`admin-nav-tab ${activeTab === 'sessions' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              <Mic size={14} />
              <span>Master Sessions</span>
              <span className="admin-tab-badge">{sessions.length}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ThemeToggle />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--accent-amber)' }}>{currentUser?.name}</strong>
            </div>
            <button className="creator-quick-btn active-red" onClick={logout} style={{ height: '30px' }}>
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Global Notification Banner */}
      {storageActionMsg && (
        <div style={{ margin: '8px 24px -6px 24px', padding: '8px 14px', background: 'rgba(255, 183, 0, 0.12)', border: '1px solid var(--accent-amber)', borderRadius: '8px', color: 'var(--accent-amber)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={14} /> <span>{storageActionMsg}</span>
        </div>
      )}

      {/* Main Super Admin Views */}
      <main className="admin-dashboard-main" style={{ padding: '16px 24px', overflowY: 'auto' }}>
        
        {/* TAB 1: GLOBAL OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Top 4 Global Stat Cards */}
            <section className="stat-cards-grid">
              <div className="card-panel stat-card" style={{ borderTop: '3px solid var(--accent-amber)' }}>
                <div className="stat-card-header">
                  <span>TOTAL STUDIO ADMINS</span>
                  <Shield size={18} color="var(--accent-amber)" />
                </div>
                <div className="stat-card-val" style={{ color: 'var(--accent-amber)' }}>{admins.length}</div>
                <div className="stat-card-sub">Independent Organization Admins</div>
              </div>

              <div className="card-panel stat-card" style={{ borderTop: '3px solid var(--accent-cyan)' }}>
                <div className="stat-card-header">
                  <span>TOTAL HOST ACCOUNTS</span>
                  <Users size={18} color="var(--accent-cyan)" />
                </div>
                <div className="stat-card-val" style={{ color: 'var(--accent-cyan)' }}>{totalHostsCount}</div>
                <div className="stat-card-sub">Assigned Across All Admins</div>
              </div>

              <div className="card-panel stat-card" style={{ borderTop: '3px solid var(--accent-green)' }}>
                <div className="stat-card-header">
                  <span>GLOBAL RECORDING SESSIONS</span>
                  <Mic size={18} color="var(--accent-green)" />
                </div>
                <div className="stat-card-val" style={{ color: 'var(--accent-green)' }}>{sessions.length}</div>
                <div className="stat-card-sub">Multi-Track Dual-Channel Recordings</div>
              </div>

              <div className="card-panel stat-card" style={{ borderTop: '3px solid #c084fc' }}>
                <div className="stat-card-header">
                  <span>CUMULATIVE ON-AIR TIME</span>
                  <Clock size={18} color="#c084fc" />
                </div>
                <div className="stat-card-val" style={{ color: '#c084fc' }}>{formatDuration(totalGlobalDuration)}</div>
                <div className="stat-card-sub">Total Platform Broadcast Audio</div>
              </div>

              <div className="card-panel stat-card" style={{ borderTop: '3px solid var(--accent-amber)' }}>
                <div className="stat-card-header">
                  <span>GLOBAL STORAGE</span>
                  <Database size={18} color="var(--accent-amber)" />
                </div>
                <div className="stat-card-val" style={{ color: 'var(--accent-amber)' }}>{storageInfo.usedMb} MB</div>
                <div className="stat-card-sub">Quota: {storageInfo.limitMb} MB ({((storageInfo.usedMb / Math.max(1, storageInfo.limitMb)) * 100).toFixed(1)}%)</div>
              </div>
            </section>

            {/* Organizations Hierarchy Cards */}
            <section className="card-panel">
              <div className="card-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={16} color="var(--accent-amber)" />
                  <span>ORGANIZATION MULTI-TENANT HIERARCHY</span>
                </div>
                <span className="tag">{admins.length} ACTIVE STUDIOS</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginTop: '6px' }}>
                {admins.map((adm) => {
                  const assignedHosts = allUsersList.filter((u) => u.role === 'host' && (u.adminId === adm.id || (!u.adminId && adm.id === 'usr_admin1')));
                  const adminSessions = sessions.filter((s) => s.adminId === adm.id || (!s.adminId && adm.id === 'usr_admin1'));
                  const adminDuration = adminSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);

                  return (
                    <div
                      key={adm.id}
                      style={{
                        background: 'var(--bg-darker)',
                        border: '1px solid var(--border-dim)',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                            {adm.organizationName || 'Independent Studio'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                            Admin: {adm.name} ({adm.email})
                          </div>
                        </div>
                        <span className="daw-badge" style={{ color: 'var(--accent-green)' }}>
                          {assignedHosts.length} Hosts
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.72rem', background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '6px' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Sessions: </span>
                          <strong style={{ color: 'var(--accent-cyan)' }}>{adminSessions.length}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Total Audio: </span>
                          <strong style={{ color: 'var(--accent-green)' }}>{formatDuration(adminDuration)}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          className="creator-quick-btn"
                          onClick={() => {
                            setFilterAdminId(adm.id);
                            setActiveTab('hosts');
                          }}
                          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                        >
                          <Users size={11} /> View {assignedHosts.length} Hosts
                        </button>
                        <button
                          className="creator-quick-btn active-cyan"
                          onClick={() => {
                            setFilterAdminId(adm.id);
                            setActiveTab('sessions');
                          }}
                          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                        >
                          <Mic size={11} /> View Sessions
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: STUDIO ADMINS MANAGEMENT */}
        {activeTab === 'admins' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
            {/* Admins Table */}
            <div className="card-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={16} color="var(--accent-amber)" />
                  <span>REGISTERED STUDIO ADMINISTRATORS</span>
                </div>
                <span className="tag">{admins.length} ADMINS</span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ADMINISTRATOR</th>
                      <th>ORGANIZATION / AGENCY</th>
                      <th>HOSTS</th>
                      <th>SESSIONS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((adm) => {
                      const assignedHosts = allUsersList.filter((u) => u.role === 'host' && (u.adminId === adm.id || (!u.adminId && adm.id === 'usr_admin1')));
                      const adminSessions = sessions.filter((s) => s.adminId === adm.id || (!s.adminId && adm.id === 'usr_admin1'));

                      return (
                        <tr key={adm.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="avatar-circle avatar-admin">
                                {adm.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700 }}>{adm.name}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                                  {adm.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                            {adm.organizationName || 'Independent Studio'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            <span className="daw-badge">{assignedHosts.length}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {adminSessions.length}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                className="creator-quick-btn"
                                onClick={() => handleOpenEditUser(adm)}
                                title="Edit Admin Details & Reset Password"
                                style={{ padding: '4px 6px' }}
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                className="btn-icon-danger"
                                onClick={() => handleDeleteUser(adm.id, adm.name)}
                                title="Delete Admin Account"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create New Admin Form */}
            <div className="card-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={16} color="var(--accent-amber)" />
                  <span>CREATE NEW STUDIO ADMINISTRATOR</span>
                </div>
              </div>

              <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Super Admin generates Studio Admin accounts. Each Admin is assigned their own organization and can independently create and manage their own Hosts.
                </p>

                {adminAddError && (
                  <div className="login-error" style={{ margin: 0 }}>
                    <AlertCircle size={14} /> <span>{adminAddError}</span>
                  </div>
                )}
                {adminAddSuccess && (
                  <div className="login-success">
                    <CheckCircle size={14} /> <span>{adminAddSuccess}</span>
                  </div>
                )}

                <div className="login-field">
                  <label>ADMIN FULL NAME</label>
                  <input
                    className="daw-input"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="e.g. Studio Manager Alpha"
                    required
                  />
                </div>

                <div className="login-field">
                  <label>ORGANIZATION / STUDIO AGENCY NAME</label>
                  <input
                    className="daw-input"
                    value={newAdminOrg}
                    onChange={(e) => setNewAdminOrg(e.target.value)}
                    placeholder="e.g. Gotham Media Network"
                    required
                  />
                </div>

                <div className="login-field">
                  <label>ADMIN EMAIL ADDRESS</label>
                  <input
                    className="daw-input"
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@gothammedia.local"
                    required
                  />
                </div>

                <div className="login-field">
                  <label>SET INITIAL PASSWORD</label>
                  <input
                    className="daw-input"
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Set admin password"
                    required
                  />
                </div>

                <button type="submit" className="creator-quick-btn active-cyan" style={{ width: '100%', marginTop: '6px', height: '36px', justifyContent: 'center' }}>
                  <UserPlus size={14} /> Create Studio Administrator
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: GLOBAL HOSTS ROSTER */}
        {activeTab === 'hosts' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
            {/* Hosts Table */}
            <div className="card-panel">
              <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={16} color="var(--accent-cyan)" />
                  <span>ALL HOSTS ACROSS ALL STUDIOS</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    className="daw-select"
                    style={{ height: '28px', fontSize: '0.72rem', width: '170px' }}
                    value={filterAdminId}
                    onChange={(e) => setFilterAdminId(e.target.value)}
                  >
                    <option value="all">All Studio Admins</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.organizationName || a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>HOST SPEAKER</th>
                      <th>ASSIGNED ADMIN / STUDIO</th>
                      <th>EMAIL</th>
                      <th>TOTAL SESSIONS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsersList
                      .filter((u) => u.role === 'host')
                      .filter((u) => filterAdminId === 'all' || u.adminId === filterAdminId || (!u.adminId && filterAdminId === 'usr_admin1'))
                      .map((host) => {
                        const managingAdmin = admins.find((a) => a.id === host.adminId) || admins[0];
                        const hostSessions = sessions.filter((s) => s.hostId === host.id);

                        return (
                          <tr key={host.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="avatar-circle avatar-user">
                                  {host.name.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontWeight: 600 }}>{host.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className="daw-badge" style={{ color: 'var(--accent-amber)', borderColor: 'rgba(255,183,0,0.3)' }}>
                                {managingAdmin ? managingAdmin.organizationName || managingAdmin.name : 'Alpha Media'}
                              </span>
                            </td>
                            <td style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{host.email}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{hostSessions.length}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  className="creator-quick-btn"
                                  onClick={() => handleOpenEditUser(host)}
                                  title="Edit Host Details & Reassign Admin"
                                  style={{ padding: '4px 6px' }}
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  className="btn-icon-danger"
                                  onClick={() => handleDeleteUser(host.id, host.name)}
                                  title="Delete Host"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create Host Form (Super Admin directly assign to any Admin) */}
            <div className="card-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={16} color="var(--accent-cyan)" />
                  <span>PROVISION NEW HOST SPEAKER</span>
                </div>
              </div>

              <form onSubmit={handleCreateHost} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Assign new Host speakers to a specific Studio Admin to manage their recordings.
                </p>

                {hostAddError && (
                  <div className="login-error" style={{ margin: 0 }}>
                    <AlertCircle size={14} /> <span>{hostAddError}</span>
                  </div>
                )}
                {hostAddSuccess && (
                  <div className="login-success">
                    <CheckCircle size={14} /> <span>{hostAddSuccess}</span>
                  </div>
                )}

                <div className="login-field">
                  <label>ASSIGN TO STUDIO ADMIN</label>
                  <select
                    className="daw-select"
                    value={newHostAdminId}
                    onChange={(e) => setNewHostAdminId(e.target.value)}
                  >
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.organizationName || 'Studio'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="login-field">
                  <label>HOST FULL NAME</label>
                  <input
                    className="daw-input"
                    value={newHostName}
                    onChange={(e) => setNewHostName(e.target.value)}
                    placeholder="e.g. John Miller"
                    required
                  />
                </div>

                <div className="login-field">
                  <label>HOST EMAIL ADDRESS</label>
                  <input
                    className="daw-input"
                    type="email"
                    value={newHostEmail}
                    onChange={(e) => setNewHostEmail(e.target.value)}
                    placeholder="john@studio.local"
                    required
                  />
                </div>

                <div className="login-field">
                  <label>SET INITIAL PASSWORD</label>
                  <input
                    className="daw-input"
                    type="password"
                    value={newHostPassword}
                    onChange={(e) => setNewHostPassword(e.target.value)}
                    placeholder="Host Password"
                    required
                  />
                </div>

                <button type="submit" className="creator-quick-btn active-cyan" style={{ width: '100%', marginTop: '6px', height: '36px', justifyContent: 'center' }}>
                  <UserPlus size={14} /> Provision Host Account
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: GLOBAL MASTER SESSIONS */}
        {activeTab === 'sessions' && (
          <div className="card-panel">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileAudio size={16} color="var(--accent-green)" />
                <span>GLOBAL RECORDED PODCAST SESSIONS & STEMS AUDIT</span>
              </div>

              {/* Filter by Studio Admin */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  className="daw-select"
                  style={{ height: '28px', fontSize: '0.72rem', width: '180px' }}
                  value={filterAdminId}
                  onChange={(e) => setFilterAdminId(e.target.value)}
                >
                  <option value="all">All Studio Admins</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.organizationName || a.name}
                    </option>
                  ))}
                </select>

                <button
                  className="creator-quick-btn"
                  onClick={() => purgeOldSessions(30)}
                  title="Purge sessions older than 30 days globally"
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                >
                  <Database size={11} /> Purge &gt;30d
                </button>
                <button
                  className="creator-quick-btn active-red"
                  onClick={async () => {
                    if (window.confirm('⚠️ Super Admin: Permanently reset ALL audio storage across all studios?')) {
                      clearAllSessions();
                      await clearAllAudioBlobs();
                      refreshData();
                    }
                  }}
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                >
                  <Trash2 size={11} /> Reset Global Storage
                </button>
              </div>
            </div>

            {/* Sessions Table */}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>PREVIEW</th>
                    <th>SESSION TITLE</th>
                    <th>STUDIO / ADMIN</th>
                    <th>HOST</th>
                    <th>GUEST</th>
                    <th>DURATION</th>
                    <th>DATE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions
                    .filter((s) => filterAdminId === 'all' || s.adminId === filterAdminId || (!s.adminId && filterAdminId === 'usr_admin1'))
                    .map((s) => {
                      const managingAdmin = admins.find((a) => a.id === s.adminId) || admins[0];
                      return (
                        <tr key={s.id}>
                          <td>
                            <button
                              className={`creator-quick-btn ${previewingSession?.id === s.id ? 'active-cyan' : ''}`}
                              style={{ padding: '4px 8px', height: '26px' }}
                              onClick={() => handleTogglePreviewAudio(s)}
                            >
                              {previewingSession?.id === s.id && auditionIsPlaying ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                          </td>
                          <td style={{ fontWeight: 700 }}>{s.title}</td>
                          <td>
                            <span className="daw-badge" style={{ color: 'var(--accent-amber)', borderColor: 'rgba(255,183,0,0.3)' }}>
                              {managingAdmin ? managingAdmin.organizationName || managingAdmin.name : 'Alpha Media'}
                            </span>
                          </td>
                          <td>{s.hostName}</td>
                          <td style={{ color: 'var(--accent-amber)' }}>{s.guestName}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                            {formatDuration(s.durationSeconds)}
                          </td>
                          <td style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(s.createdAt).toLocaleDateString()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="creator-quick-btn"
                                onClick={() => setSelectedSessionForMetadata(s)}
                                title="Metadata"
                              >
                                <FileCode size={12} />
                              </button>
                              <button
                                className="creator-quick-btn active-red"
                                onClick={() => handleDeleteSingleSession(s)}
                                title="Delete session"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Floating Audio Audition Player Dock */}
      {previewingSession && (
        <div className="floating-audition-dock">
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="creator-quick-btn" onClick={handleCloseAudition} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Edit User / Reassign Admin Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="var(--accent-amber)" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                  EDIT {editingUser.role.toUpperCase()} PROFILE
                </h3>
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
                <div className={editUserMsg.type === 'success' ? 'login-success' : 'login-error'}>
                  {editUserMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <span>{editUserMsg.text}</span>
                </div>
              )}

              <div className="login-field">
                <label>DISPLAY NAME</label>
                <input
                  className="daw-input"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  required
                />
              </div>

              {editingUser.role === 'admin' && (
                <div className="login-field">
                  <label>STUDIO / AGENCY ORGANIZATION NAME</label>
                  <input
                    className="daw-input"
                    value={editUserOrg}
                    onChange={(e) => setEditUserOrg(e.target.value)}
                    required
                  />
                </div>
              )}

              {editingUser.role === 'host' && (
                <div className="login-field">
                  <label>ASSIGNED MANAGING ADMIN</label>
                  <select
                    className="daw-select"
                    value={editUserAdminId}
                    onChange={(e) => setEditUserAdminId(e.target.value)}
                  >
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.organizationName || 'Studio'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

      {/* Metadata Modal */}
      {selectedSessionForMetadata && (
        <AudioMetadataModal
          session={selectedSessionForMetadata}
          onClose={() => setSelectedSessionForMetadata(null)}
        />
      )}
    </div>
  );
};
