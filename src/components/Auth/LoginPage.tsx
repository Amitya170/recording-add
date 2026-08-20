import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Radio, AlertCircle, Mic, Shield, Sparkles, FolderSync, Zap, Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { ThemeToggle } from '../Common/ThemeToggle';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@studio.local');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'host'>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shakeError, setShakeError] = useState(false);

  const handleSelectRole = (role: 'admin' | 'host') => {
    setSelectedRole(role);
    setError('');
    if (role === 'admin') {
      setEmail('admin@studio.local');
      setPassword('admin123');
    } else {
      setEmail('host@studio.local');
      setPassword('host123');
    }
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

          {/* 4 Feature Value Pillars */}
          <div className="hero-features-grid">
            <div className="hero-feature-card">
              <div className="hero-feature-icon cyan">
                <Mic size={18} />
              </div>
              <div>
                <h4>Dual-Stem Isolation</h4>
                <p>Discrete Host & Guest tracks for clean stereo mixing.</p>
              </div>
            </div>

            <div className="hero-feature-card">
              <div className="hero-feature-icon purple">
                <Zap size={18} />
              </div>
              <div>
                <h4>AudioWorklet DSP</h4>
                <p>Thread-isolated 64-bit engine with zero audio dropouts.</p>
              </div>
            </div>

            <div className="hero-feature-card">
              <div className="hero-feature-icon green">
                <Shield size={18} />
              </div>
              <div>
                <h4>Parametric EQ & Gate</h4>
                <p>Live 3-band vocal sculpting & spectral noise suppression.</p>
              </div>
            </div>

            <div className="hero-feature-card">
              <div className="hero-feature-icon amber">
                <FolderSync size={18} />
              </div>
              <div>
                <h4>Google Drive Sync</h4>
                <p>Instant automated cloud archiving without API keys.</p>
              </div>
            </div>
          </div>

          {/* Harmonic Waveform Soundbars Animation */}
          <div className="hero-soundbars-wrap">
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>AUDIO SIGNAL: 48 kHz / 32-BIT FLOAT</span>
            <div className="hero-soundbars">
              {Array.from({ length: 24 }).map((_, idx) => (
                <div
                  key={idx}
                  className="hero-soundbar"
                  style={{
                    animationDuration: `${0.6 + (idx % 5) * 0.25}s`,
                    animationDelay: `${idx * 0.05}s`,
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
                Select your studio workspace role or enter credentials
              </p>
            </div>

            {/* Fast 1-Click Role Switcher */}
            <div className="role-switch-pills">
              <button
                type="button"
                className={`role-switch-btn ${selectedRole === 'admin' ? 'is-active' : ''}`}
                onClick={() => handleSelectRole('admin')}
              >
                <Shield size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.75rem' }}>Admin Console</div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.7 }}>Full Studio Governance</div>
                </div>
              </button>

              <button
                type="button"
                className={`role-switch-btn ${selectedRole === 'host' ? 'is-active' : ''}`}
                onClick={() => handleSelectRole('host')}
              >
                <Mic size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.75rem' }}>Host Studio</div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.7 }}>Live Recording Suite</div>
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
                  placeholder="name@studio.local"
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
                  placeholder="••••••••"
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
                  <span>Enter {selectedRole === 'admin' ? 'Admin Console' : 'Host Studio'}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Demo Quick Fill Footnote */}
            <div className="demo-credentials-tray">
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Quick Demo Sign-In:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="demo-chip-btn"
                  onClick={() => handleSelectRole('admin')}
                >
                  admin@studio.local
                </button>
                <button
                  type="button"
                  className="demo-chip-btn"
                  onClick={() => handleSelectRole('host')}
                >
                  host@studio.local
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};


