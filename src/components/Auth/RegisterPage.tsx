import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Radio, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';

interface RegisterPageProps {
  inviteToken: string;
  onRegistered: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ inviteToken, onRegistered }) => {
  const { getInviteToken, registerWithInvite } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenEmail, setTokenEmail] = useState('');
  const [validToken, setValidToken] = useState(false);

  useEffect(() => {
    const invite = getInviteToken(inviteToken);
    if (invite) {
      setTokenEmail(invite.email);
      setValidToken(true);
    } else {
      setValidToken(false);
    }
  }, [inviteToken, getInviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setLoading(true);
    setError('');
    const ok = await registerWithInvite(inviteToken, name, password);
    setLoading(false);

    if (ok) {
      setSuccess(true);
      setTimeout(() => onRegistered(), 1500);
    } else {
      setError('Registration failed. The invite may have already been used.');
    }
  };

  if (!validToken) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo-group">
            <div className="login-logo-circle" style={{ background: 'rgba(255,42,95,0.2)', borderColor: 'rgba(255,42,95,0.5)' }}>
              <AlertCircle size={32} color="#ff2a5f" />
            </div>
            <h1 className="login-title">INVALID INVITE</h1>
            <p className="login-subtitle">This invitation link is invalid or has already been used.</p>
          </div>
          <button className="btn-login" onClick={onRegistered}>Back to Login</button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo-group">
            <div className="login-logo-circle" style={{ background: 'rgba(0,255,135,0.15)', borderColor: 'rgba(0,255,135,0.4)' }}>
              <CheckCircle size={32} color="#00ff87" />
            </div>
            <h1 className="login-title">ACCOUNT CREATED</h1>
            <p className="login-subtitle">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo-group">
          <div className="login-logo-circle">
            <Radio size={32} />
          </div>
          <h1 className="login-title">JOIN THE STUDIO</h1>
          <p className="login-subtitle">You've been invited as <strong style={{ color: 'var(--accent-cyan)' }}>{tokenEmail}</strong></p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="login-field">
          <label>YOUR NAME</label>
          <input
            type="text"
            className="daw-input"
            placeholder="Enter your display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="login-field">
          <label>CREATE PASSWORD</label>
          <input
            type="password"
            className="daw-input"
            placeholder="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="login-field">
          <label>CONFIRM PASSWORD</label>
          <input
            type="password"
            className="daw-input"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-login" disabled={loading}>
          <UserPlus size={18} />
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </div>
  );
};
