import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Radio, LogIn, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shakeError, setShakeError] = useState(false);

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
      setError('Invalid email or password. Please check your credentials.');
      setShakeError(true);
      setTimeout(() => setShakeError(false), 600);
    }
  };

  return (
    <div className="login-page">
      <div className="login-particles">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="login-particle" style={{ animationDelay: `${i * 0.8}s` }} />
        ))}
      </div>

      <form className={`login-card ${shakeError ? 'shake' : ''}`} onSubmit={handleSubmit}>
        <div className="login-logo-group">
          <div className="login-logo-circle">
            <Radio size={32} />
          </div>
          <h1 className="login-title">PODCAST CRAFT STUDIO</h1>
          <p className="login-subtitle">Professional Dual-Channel Audio Recording & DAW Console</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="login-field">
          <label htmlFor="login-email">EMAIL ADDRESS</label>
          <input
            id="login-email"
            type="email"
            className="daw-input"
            placeholder="admin@studio.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="login-field">
          <label htmlFor="login-password">PASSWORD</label>
          <input
            id="login-password"
            type="password"
            className="daw-input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="btn-login" disabled={loading}>
          <LogIn size={18} />
          {loading ? 'Authenticating...' : 'Sign In to Studio Console'}
        </button>
      </form>
    </div>
  );
};

