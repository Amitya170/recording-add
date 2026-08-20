import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './styles/ThemeContext';
import { LoginPage } from './components/Auth/LoginPage';
import { RegisterPage } from './components/Auth/RegisterPage';
import { SuperAdminPanel } from './components/SuperAdmin/SuperAdminPanel';
import { AdminPanel } from './components/Admin/AdminPanel';
import { PodcastStudio } from './components/Podcast/PodcastStudio';
import { GuestStudioView } from './components/Podcast/GuestStudioView';
import { ScrollControls } from './components/Common/ScrollControls';
import './styles/daw-theme.css';

const getInitialUrlParams = () => {
  if (typeof window === 'undefined') {
    return {
      inviteToken: null as string | null,
      guestNameParam: undefined as string | undefined,
      hostNameParam: undefined as string | undefined,
      sessionToken: 'podcast_main_session',
      isGuestSession: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  const guest = params.get('guest');
  const host = params.get('host');
  const session = params.get('session');

  // If there's a guest query param OR a specific session token in URL (not invite registration)
  const isGuestSession = Boolean(guest || (session && session !== 'podcast_main_session' && !invite));
  return {
    inviteToken: invite || null,
    guestNameParam: guest || (session ? 'Guest Speaker' : undefined),
    hostNameParam: host || undefined,
    sessionToken: session || 'podcast_main_session',
    isGuestSession,
  };
};

const AppRouter: React.FC = () => {
  const { isAuthenticated, isSuperAdmin, isAdmin, currentUser } = useAuth();
  const [urlParams, setUrlParams] = useState(getInitialUrlParams);

  // Keep in sync with popstate or search params changes
  useEffect(() => {
    const handlePopState = () => {
      setUrlParams(getInitialUrlParams());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Invite Token Registration Page
  if (urlParams.inviteToken) {
    return (
      <RegisterPage
        inviteToken={urlParams.inviteToken}
        onRegistered={() => {
          setUrlParams((prev) => ({ ...prev, inviteToken: null }));
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // Guest Link Access (Activated on Guest Invite Link)
  // If the user arrived via invite link, route them directly into GuestStudioView
  if (urlParams.isGuestSession && (!isAuthenticated || currentUser?.role === 'user' || urlParams.guestNameParam)) {
    return (
      <GuestStudioView
        guestNameParam={urlParams.guestNameParam}
        hostNameParam={urlParams.hostNameParam}
        sessionToken={urlParams.sessionToken}
      />
    );
  }

  // Unauthenticated → Login Page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Super Admin Role → Multi-Tenant Root Command Portal
  if (isSuperAdmin) {
    return <SuperAdminPanel />;
  }

  // Admin Role → Pure Admin Analytics & Isolated Studio Dashboard
  if (isAdmin) {
    return <AdminPanel />;
  }

  // Guest Role → Dedicated Guest Console View
  if (currentUser?.role === 'user') {
    return <GuestStudioView guestNameParam={currentUser.name} sessionToken={urlParams.sessionToken} />;
  }

  // Host Role → Full Podcast Recording Studio DAW
  return <PodcastStudio sessionToken={urlParams.sessionToken} />;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
        <ScrollControls />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
