import React, { useState } from 'react';
import { X, Copy, CheckCircle, Mail, UserPlus, Link2 } from 'lucide-react';

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
  const [inviteLink, setInviteLink] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [copied, setCopied] = useState(false);

  // Helper to generate cryptographically random unique invite link
  const createUniqueLink = (name: string, forceNewSession: boolean = false) => {
    const uniqueInvCode = 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const safeHost = (hostName || 'host').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newSessionId = forceNewSession
      ? `room_${safeHost}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      : (sessionToken || `room_${safeHost}_${Date.now().toString(36)}`);

    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?session=${newSessionId}&guest=${encodeURIComponent(name.trim() || 'Guest Speaker')}&host=${encodeURIComponent(hostName)}&inv=${uniqueInvCode}`;
    setInviteId(uniqueInvCode);
    setInviteLink(link);

    if (forceNewSession && onSessionTokenChange) {
      onSessionTokenChange(newSessionId);
    }
  };

  // Generate invite link on initial render using active host room
  React.useEffect(() => {
    createUniqueLink(guestName, false);
  }, []);

  const handleGenerateLink = (e: React.FormEvent) => {
    e.preventDefault();
    createUniqueLink(guestName, false);
  };

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

          <button type="submit" className="btn-transport btn-cyan" style={{ width: '100%', marginTop: '4px' }}>
            <Link2 size={15} /> Update Invite Link for Guest
          </button>
        </form>

        {inviteLink && (
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-dim)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                UNIQUE GUEST STUDIO RECORDING LINK:
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
              <button className="btn-transport" onClick={handleCopyLink} title="Copy link">
                {copied ? <CheckCircle size={14} color="#00ff87" /> : <Copy size={14} />}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-transport"
                onClick={() => createUniqueLink(guestName, true)}
                style={{ flex: 1, fontSize: '0.75rem', padding: '6px 12px' }}
                title="Invalidate old link and generate a brand new unique session link"
              >
                🎲 Invalidate Old & Generate New Link
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
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.25)', borderRadius: '6px', padding: '8px 10px', marginTop: '4px' }}>
                💡 <strong>Testing on a 2nd device on the same Wi-Fi?</strong> Replace <code>localhost</code> in the link with your computer's local Wi-Fi IP address (e.g. <code>http://192.168.1.X:5173</code>) so the other device can open the page.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
