/**
 * AuthContext — User authentication and role management.
 * Supported Roles:
 * - 'admin' : Access to Analytics Reports & Host account creation only.
 * - 'host'  : Access to Recording Studio DAW & Guest invitation creation.
 * - 'user'  : Guest speaker.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'host' | 'user';
  passwordHash: string;
  createdAt: string;
}

export interface InviteToken {
  token: string;
  email: string;
  createdAt: string;
  used: boolean;
}

interface AuthContextValue {
  currentUser: User | null;
  isAdmin: boolean;
  isHost: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  createHostAccount: (email: string, name: string, password: string) => Promise<boolean>;
  deleteUser: (id: string) => void;
  getAllUsers: () => User[];
  createInviteToken: (email: string) => InviteToken;
  getInviteToken: (token: string) => InviteToken | null;
  registerWithInvite: (token: string, name: string, password: string) => Promise<boolean>;
  updateUser: (id: string, updates: { name?: string; password?: string }) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USERS_KEY = 'podcast_studio_users';
const SESSION_KEY = 'podcast_studio_session';
const INVITES_KEY = 'podcast_studio_invites';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function getStoredUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getStoredInvites(): InviteToken[] {
  try {
    const raw = localStorage.getItem(INVITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredInvites(invites: InviteToken[]) {
  localStorage.setItem(INVITES_KEY, JSON.stringify(invites));
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Seed default admin and sample host on launch
  useEffect(() => {
    const seedInitialData = async () => {
      let users = getStoredUsers();
      const adminHash = await hashPassword('admin123');
      const hostHash = await hashPassword('host123');

      let admin = users.find((u) => u.email.toLowerCase() === 'admin@studio.local');
      if (!admin) {
        admin = {
          id: 'usr_admin',
          email: 'admin@studio.local',
          name: 'Studio Administrator',
          role: 'admin',
          passwordHash: adminHash,
          createdAt: new Date().toISOString(),
        };
        users.unshift(admin);
      } else {
        admin.passwordHash = adminHash;
      }

      let host = users.find((u) => u.email.toLowerCase() === 'host@studio.local');
      if (!host) {
        host = {
          id: 'usr_host1',
          email: 'host@studio.local',
          name: 'Sarah Connor (Host)',
          role: 'host',
          passwordHash: hostHash,
          createdAt: new Date().toISOString(),
        };
        users.push(host);
      } else {
        host.passwordHash = hostHash;
      }

      setStoredUsers(users);

      // Restore session
      const sessionId = localStorage.getItem(SESSION_KEY);
      if (sessionId) {
        const user = users.find((u) => u.id === sessionId);
        if (user) setCurrentUser(user);
      }
      setInitialized(true);
    };
    seedInitialData();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    let users = getStoredUsers();
    const hash = await hashPassword(cleanPassword);

    let user = users.find((u) => u.email.toLowerCase() === cleanEmail && u.passwordHash === hash);

    // Dynamic on-demand creation for default accounts if missing from localStorage
    if (!user) {
      if (cleanEmail === 'admin@studio.local' && cleanPassword === 'admin123') {
        user = users.find((u) => u.email.toLowerCase() === 'admin@studio.local');
        if (!user) {
          user = {
            id: 'usr_admin',
            email: 'admin@studio.local',
            name: 'Studio Administrator',
            role: 'admin',
            passwordHash: hash,
            createdAt: new Date().toISOString(),
          };
          users.unshift(user);
        }
      } else if (cleanEmail === 'host@studio.local' && cleanPassword === 'host123') {
        user = users.find((u) => u.email.toLowerCase() === 'host@studio.local');
        if (!user) {
          user = {
            id: 'usr_host1',
            email: 'host@studio.local',
            name: 'Sarah Connor (Host)',
            role: 'host',
            passwordHash: hash,
            createdAt: new Date().toISOString(),
          };
          users.push(user);
        }
      }
    }

    if (user) {
      user.passwordHash = hash;
      setStoredUsers(users);
      setCurrentUser(user);
      localStorage.setItem(SESSION_KEY, user.id);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const createHostAccount = useCallback(async (email: string, name: string, password: string): Promise<boolean> => {
    const users = getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return false; // Duplicate
    }
    const hash = await hashPassword(password);
    const newHost: User = {
      id: generateId(),
      email,
      name,
      role: 'host',
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };
    users.push(newHost);
    setStoredUsers(users);
    return true;
  }, []);

  const deleteUser = useCallback((id: string) => {
    const users = getStoredUsers().filter((u) => u.id !== id);
    setStoredUsers(users);
  }, []);

  const getAllUsers = useCallback((): User[] => {
    return getStoredUsers();
  }, []);

  const createInviteToken = useCallback((email: string): InviteToken => {
    const invites = getStoredInvites();
    const token: InviteToken = {
      token: generateId() + generateId(),
      email,
      createdAt: new Date().toISOString(),
      used: false,
    };
    invites.push(token);
    setStoredInvites(invites);
    return token;
  }, []);

  const getInviteToken = useCallback((token: string): InviteToken | null => {
    const invites = getStoredInvites();
    return invites.find((i) => i.token === token && !i.used) || null;
  }, []);

  const registerWithInvite = useCallback(async (token: string, name: string, password: string): Promise<boolean> => {
    const invite = getInviteToken(token);
    if (!invite) return false;
    const ok = await createHostAccount(invite.email, name, password);
    if (ok) {
      const invites = getStoredInvites();
      const inv = invites.find((i) => i.token === token);
      if (inv) inv.used = true;
      setStoredInvites(invites);
    }
    return ok;
  }, [getInviteToken, createHostAccount]);

  const updateUser = useCallback(async (id: string, updates: { name?: string; password?: string }): Promise<boolean> => {
    const users = getStoredUsers();
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) return false;

    if (updates.name && updates.name.trim()) {
      users[userIndex].name = updates.name.trim();
    }
    if (updates.password && updates.password.trim()) {
      users[userIndex].passwordHash = await hashPassword(updates.password.trim());
    }

    setStoredUsers(users);
    if (currentUser?.id === id) {
      setCurrentUser({ ...users[userIndex] });
    }
    return true;
  }, [currentUser]);

  if (!initialized) return null;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin: currentUser?.role === 'admin',
        isHost: currentUser?.role === 'host' || currentUser?.role === 'admin',
        isAuthenticated: currentUser !== null,
        login,
        logout,
        createHostAccount,
        deleteUser,
        getAllUsers,
        createInviteToken,
        getInviteToken,
        registerWithInvite,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
