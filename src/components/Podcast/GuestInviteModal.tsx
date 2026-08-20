import React, { useState } from 'react';
import { X, Copy, CheckCircle, Mail, UserPlus, Link2, Globe, RefreshCw } from 'lucide-react';
import { getActiveHostSessionToken, rotateHostSessionToken } from '../../auth/SessionStore';

interface GuestInviteModalProps {
  hostName: string;
  sessionToken?: string;
  onSessionTokenChange?: (newToken: string) => void;
  onClose: () => void;
}

export const GuestInviteModal: React.FC<GuestInviteModalProps> = ({
  hostName,
  sessionToken,
  onSessionTokenChange,
  onClose,
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [customOrigin, setCustomOrigin] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedPublic, setCopiedPublic] = useState(false);

  const safeHost = (hostName || 'host').toLowerCase().replace(/[^a-z0-9]/g, '_');

  // Helper to generate cryptographically random unique invite link
  const createUniqueLink = (name: string, forceNewSession: boolean = false, overrideOrigin?: string) => {
    const uniqueInvCode = 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    
    let newSessionId: string;
    if (forceNewSession) {
      newSessionId = rotateHostSessionToken(safeHost);
    } else {
      newSessionId = sessionToken || getActiveHostSessionToken(safeHost);
    }

    const hostOrigin = (overrideOrigin && overrideOrigin.trim()) 
      ? overrideOrigin.trim().replace(/\/+$/, '') 
      : window.location.origin;
    const path = window.location.pathname.replace(/\/+$/, '') || '';
    const baseUrl = hostOrigin + path;

    const link = `${baseUrl}?session=${newSessionId}&guest=${encodeURIComponent(name.trim() || 'Guest Speaker')}&host=${encodeURIComponent(hostName)}&inv=${uniqueInvCode}`;
    setInviteId(uniqueInvCode);
    setInviteLink(link);

    if (forceNewSession && onSessionTokenChange) {
      onSessionTokenChange(newSessionId);
    }
  };

  // Generate invite link on initial render using active persistent host room
  React.useEffect(() => {
    createUniqueLink(guestName, false);
  }, []);

  const handleGenerateLink = (e: React.FormEvent) => {
    e.preventDefault();
    createUniqueLink(guestName, false, customOrigin);
  };

  const handleCopyLink = (customText?: string) => {
    const textToCopy = customText || inviteLink;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    if (customText) {
      setCopiedPublic(true);
      setTimeout(() => setCopiedPublic(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendEmail = () => {
    if (!inviteLink) return;
    const subject = encodeURIComponent(`Join Podcast Recording Session with ${hostName}`);
    const body = encodeURIComponent(
      `Hello ${guestName || 'Guest'},\n\nYou have been invited by ${hostName} to join a live dual-channel podcast recording session.\n\nClick the link below to connect your microphone and join the studio session:\n${inviteLink}\n\nBest regards,\n${hostName}`
    );
    window.open(`mailto:${guestEmail}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus className="daw-logo-icon" size={20} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>INVITE GUEST TO RECORDING SESSION</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleGenerateLink} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="login-field">
            <label>GUEST SPEAKER NAME</label>
            <input
              className="daw-input"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Dr. Jane Goodall"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label>GUEST EMAIL ADDRESS (OPTIONAL FOR DIRECT EMAIL)</label>
            <input
              className="daw-input"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="guest@domain.com"
            />
          </div>

          {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
            <div className="login-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Globe size={13} color="var(--accent-cyan)" />
                PUBLIC DOMAIN / TUNNEL URL (FOR REMOTE GUESTS FAR AWAY)
              </label>
              <input
                className="daw-input"
                value={customOrigin}
                onChange={(e) => {
                  setCustomOrigin(e.target.value);
                  createUniqueLink(guestName, false, e.target.value);
                }}
                placeholder="e.g. https://my-podcast-app.vercel.app or https://xxxx.ngrok-free.app"
              />
            </div>
          )}

          <button type="submit" className="btn-transport btn-cyan" style={{ width: '100%', marginTop: '4px' }}>
            <Link2 size={15} /> Update Invite Link for Guest
          </button>
        </form>

        {inviteLink && (
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-dim)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                ACTIVE GUEST STUDIO RECORDING LINK:
              </label>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(0, 240, 255, 0.12)', border: '1px solid rgba(0, 240, 255, 0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                {inviteId}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                className="daw-input"
                readOnly
                value={inviteLink}
                style={{ flex: 1, fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}
              />
              <button className="btn-transport" onClick={() => handleCopyLink()} title="Copy link">
                {copied ? <CheckCircle size={14} color="#00ff87" /> : <Copy size={14} />}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-transport"
                onClick={() => createUniqueLink(guestName, true, customOrigin)}
                style={{ flex: 1, fontSize: '0.75rem', padding: '6px 12px', background: 'rgba(255, 59, 48, 0.12)', border: '1px solid rgba(255, 59, 48, 0.35)', color: 'var(--accent-red)' }}
                title="Invalidate old link and generate a brand new unique session link"
              >
                <RefreshCw size={13} /> Invalidate Old & Generate New Link
              </button>
            </div>

            <button className="btn-transport" onClick={handleSendEmail} style={{ width: '100%' }}>
              <Mail size={14} /> Send Invite via Email (mailto:)
            </button>

            {copied && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-green)', textAlign: 'center' }}>
                ✓ Copied invite link to clipboard! Send it to your guest speaker.
              </div>
            )}

            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.25)', borderRadius: '6px', padding: '8px 10px', marginTop: '4px', lineHeight: '1.4' }}>
                🌐 <strong>Sending to someone far away?</strong> Since your server is currently running locally on <code>localhost</code>, the other person cannot access your computer's localhost directly. Deploy the app (Vercel/Netlify) or use a free tunnel (like <code>ngrok http 5173</code>) and paste your public domain above to share a working link across the internet!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
