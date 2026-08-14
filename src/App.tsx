import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './components/Auth/LoginPage';
import { RegisterPage } from './components/Auth/RegisterPage';
import { AdminPanel } from './components/Admin/AdminPanel';
import { PodcastStudio } from './components/Podcast/PodcastStudio';
import { GuestStudioView } from './components/Podcast/GuestStudioView';
import './styles/daw-theme.css';

const AppRouter: React.FC = () => {
  const { isAuthenticated, isAdmin, currentUser } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [guestNameParam, setGuestNameParam] = useState<string | undefined>(undefined);
  const [hostNameParam, setHostNameParam] = useState<string | undefined>(undefined);
  const [sessionToken, setSessionToken] = useState<string>('podcast_main_session');

  // Check URL parameters for invites or guest session links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) {
      setInviteToken(token);
    }
    const guest = params.get('guest');
    const host = params.get('host');
    const sess = params.get('session');
    if (guest) setGuestNameParam(guest);
    if (host) setHostNameParam(host);
    if (sess) setSessionToken(sess);
  }, []);

  // Invite Token Registration Page
  if (inviteToken) {
    return (
      <RegisterPage
        inviteToken={inviteToken}
        onRegistered={() => {
          setInviteToken(null);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // Guest Link Access (Activated on Guest Invite Link)
  if (guestNameParam) {
    return <GuestStudioView guestNameParam={guestNameParam} hostNameParam={hostNameParam} sessionToken={sessionToken} />;
  }

  // Unauthenticated → Login Page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Admin Role → Pure Admin Analytics & Duration Dashboard
  if (isAdmin) {
    return <AdminPanel />;
  }

  // Guest Role → Dedicated Guest Console View
  if (currentUser?.role === 'user') {
    return <GuestStudioView guestNameParam={currentUser.name} sessionToken={sessionToken} />;
  }

  // Host Role → Full Podcast Recording Studio DAW
  return <PodcastStudio sessionToken={sessionToken} />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
};

export default App;
