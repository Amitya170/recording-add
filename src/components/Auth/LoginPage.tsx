import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Radio, AlertCircle, Mic, Shield, Crown, Sparkles, FolderSync, Zap, Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { ThemeToggle } from '../Common/ThemeToggle';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'superadmin' | 'admin' | 'host'>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shakeError, setShakeError] = useState(false);

  const handleSelectRole = (role: 'superadmin' | 'admin' | 'host') => {
    setSelectedRole(role);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email address and password.');
      return;
    }
    setLoading(true);
    setError('');
    const ok = await login(email, password);
    setLoading(false);
    if (!ok) {
      setError('Invalid credentials. Please verify your email and password.');
      setShakeError(true);
      setTimeout(() => setShakeError(false), 600);
    }
  };

  return (
    <div className="login-creator-page">
      {/* Background Animated Gradient Mesh */}
      <div className="login-bg-glow" />
      
      {/* Top Header Navigation Bar */}
      <header className="login-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="creator-brand-icon">
            <Radio size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>
              PODCAST CRAFT <span style={{ color: 'var(--accent-cyan)' }}>STUDIO</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              Modern Creator Suite 2.0
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="daw-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
            SYSTEM ONLINE
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Split Content Area */}
      <div className="login-creator-container">
        
        {/* Left Column: Hero Feature Showcase */}
        <div className="login-hero-showcase">
          <div className="hero-pill-badge">
            <Sparkles size={13} color="var(--accent-cyan)" />
            <span>NEXT-GEN AUDIO WORKSTATION</span>
          </div>

          <h1 className="hero-headline">
            Professional Dual-Channel <br />
            <span className="hero-gradient-text">Broadcast & Podcast Studio</span>
          </h1>

          <p className="hero-description">
            Capture crystal-clear 32-bit Float stems, collaborate seamlessly with remote guests over ultra-low latency WebRTC, and master with hardware-accelerated DSP in real time.
          </p>

          {/* Live Studio Hardware & Signal Chain Showcase */}
          <div className="hero-rack-deck">
            {/* Top Telemetry Header */}
            <div className="rack-deck-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="live-rec-dot" />
                <span style={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.5px' }}>LIVE STUDIO SIGNAL CHAIN</span>
              </div>
              <span className="daw-badge" style={{ color: 'var(--accent-cyan)' }}>48 kHz / 32-BIT FLOAT</span>
            </div>

            {/* Dual Channel Live VU Meters */}
            <div className="rack-channels-container">
              {/* Channel 1: Host */}
              <div className="rack-channel-strip">
                <div className="rack-chan-label">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mic size={13} color="var(--accent-cyan)" /> CH 1 • HOST MICROPHONE
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: '0.68rem' }}>-5.4 dBFS PEAK</span>
                </div>
                <div className="rack-meter-bar">
                  <div className="rack-meter-fill fill-host" />
                </div>
              </div>

              {/* Channel 2: Remote Guest */}
              <div className="rack-channel-strip">
                <div className="rack-chan-label">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Radio size={13} color="var(--accent-amber)" /> CH 2 • REMOTE GUEST P2P
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)', fontSize: '0.68rem' }}>-8.1 dBFS PEAK</span>
                </div>
                <div className="rack-meter-bar">
                  <div className="rack-meter-fill fill-guest" />
                </div>
              </div>
            </div>

            {/* DSP Signal Processors Matrix */}
            <div className="rack-dsp-matrix">
              <div className="rack-dsp-badge">
                <Zap size={11} color="var(--accent-cyan)" />
                <span>AudioWorklet 64-Bit</span>
              </div>
              <div className="rack-dsp-badge">
                <Shield size={11} color="var(--accent-green)" />
                <span>Parametric 3-Band EQ</span>
              </div>
              <div className="rack-dsp-badge">
                <Sparkles size={11} color="var(--accent-amber)" />
                <span>Spectral Noise Gate</span>
              </div>
              <div className="rack-dsp-badge">
                <FolderSync size={11} color="#c084fc" />
                <span>Google Drive Sync</span>
              </div>
            </div>
          </div>

          {/* Harmonic Waveform Soundbars Animation */}
          <div className="hero-soundbars-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>PCM MASTER SPECTRUM</span>
              <span style={{ fontSize: '0.62rem', color: 'var(--accent-green)', fontWeight: 700 }}>● DSP REAL-TIME</span>
            </div>
            <div className="hero-soundbars">
              {Array.from({ length: 28 }).map((_, idx) => (
                <div
                  key={idx}
                  className="hero-soundbar"
                  style={{
                    animationDuration: `${0.5 + (idx % 6) * 0.2}s`,
                    animationDelay: `${idx * 0.04}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Sleek Auth Portal Card */}
        <div className="login-form-pane">
          <form className={`login-creator-card ${shakeError ? 'shake' : ''}`} onSubmit={handleSubmit}>
            
            {/* Card Header */}
            <div className="login-card-head">
              <div className="login-glow-logo">
                <Radio size={28} />
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '8px 0 2px' }}>
                Studio Sign In
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Select your workspace and enter your credentials
              </p>
            </div>

            {/* Multi-Tenant Role Switcher */}
            <div className="role-switch-pills" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <button
                type="button"
                className={`role-switch-btn ${selectedRole === 'superadmin' ? 'is-active' : ''}`}
                onClick={() => handleSelectRole('superadmin')}
                style={{ padding: '6px 8px' }}
              >
                <Crown size={14} color="var(--accent-amber)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>Super Admin</div>
                  <div style={{ fontSize: '0.58rem', opacity: 0.7 }}>Multi-Tenant Root</div>
                </div>
              </button>

              <button
                type="button"
                className={`role-switch-btn ${selectedRole === 'admin' ? 'is-active' : ''}`}
                onClick={() => handleSelectRole('admin')}
                style={{ padding: '6px 8px' }}
              >
                <Shield size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>Studio Admin</div>
                  <div style={{ fontSize: '0.58rem', opacity: 0.7 }}>Agency Console</div>
                </div>
              </button>

              <button
                type="button"
                className={`role-switch-btn ${selectedRole === 'host' ? 'is-active' : ''}`}
                onClick={() => handleSelectRole('host')}
                style={{ padding: '6px 8px' }}
              >
                <Mic size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>Host Studio</div>
                  <div style={{ fontSize: '0.58rem', opacity: 0.7 }}>Recording Suite</div>
                </div>
              </button>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div className="login-error-pill">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="auth-input-group">
              <label htmlFor="login-email">EMAIL ADDRESS</label>
              <div className="auth-input-wrap">
                <Mail size={15} className="auth-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  className="auth-text-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="auth-input-group">
              <label htmlFor="login-password">PASSWORD</label>
              <div className="auth-input-wrap">
                <Lock size={15} className="auth-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-text-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className="creator-login-submit" disabled={loading}>
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>
                    Sign In as{' '}
                    {selectedRole === 'superadmin'
                      ? 'Super Admin'
                      : selectedRole === 'admin'
                      ? 'Studio Admin'
                      : 'Host'}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


