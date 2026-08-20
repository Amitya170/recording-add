/**
 * AuthContext — User authentication and role management.
 * Supported Roles:
 * - 'superadmin' : Global Super Administrator (creates/manages Admins & global multi-tenant hierarchy).
 * - 'admin'      : Studio / Organization Administrator (manages their own assigned Hosts and Sessions only).
 * - 'host'       : Podcast Host (records audio sessions in studio, belongs to an Admin).
 * - 'user'       : Guest speaker.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'host' | 'user';
  adminId?: string; // For hosts: the ID of the Admin who created and manages them
  organizationName?: string; // For admins: agency/studio group name
  passwordHash: string;
  createdAt: string;
}

export interface InviteToken {
  token: string;
  email: string;
  adminId?: string;
  createdAt: string;
  used: boolean;
}

interface AuthContextValue {
  currentUser: User | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isHost: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  createAdminAccount: (email: string, name: string, password: string, organizationName?: string) => Promise<boolean>;
  createHostAccount: (email: string, name: string, password: string, targetAdminId?: string) => Promise<boolean>;
  deleteUser: (id: string) => void;
  getAllUsers: () => User[];
  getAllAdmins: () => User[];
  getHostsForAdmin: (adminId?: string) => User[];
  createInviteToken: (email: string, adminId?: string) => InviteToken;
  getInviteToken: (token: string) => InviteToken | null;
  registerWithInvite: (token: string, name: string, password: string) => Promise<boolean>;
  updateUser: (id: string, updates: { name?: string; password?: string; organizationName?: string; adminId?: string }) => Promise<boolean>;
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

  // Seed default SuperAdmin, Admins (Admin 1 & Admin 2) and their assigned Hosts
  useEffect(() => {
    const seedInitialData = async () => {
      let users = getStoredUsers();
      const superHash = await hashPassword('superadmin123');
      const adminHash = await hashPassword('admin123');
      const hostHash = await hashPassword('host123');

      // 1. Seed Super Admin
      let superAdmin = users.find((u) => u.email.toLowerCase() === 'superadmin@studio.local');
      if (!superAdmin) {
        superAdmin = {
          id: 'usr_superadmin',
          email: 'superadmin@studio.local',
          name: 'Chief Executive Superadmin',
          role: 'superadmin',
          passwordHash: superHash,
          createdAt: new Date().toISOString(),
        };
        users.unshift(superAdmin);
      } else {
        superAdmin.role = 'superadmin';
        superAdmin.passwordHash = superHash;
      }

      // 2. Seed Admin 1 (Alpha Podcast Network)
      let admin1 = users.find((u) => u.email.toLowerCase() === 'admin@studio.local' || u.email.toLowerCase() === 'admin1@studio.local');
      if (!admin1) {
        admin1 = {
          id: 'usr_admin1',
          email: 'admin1@studio.local',
          name: 'Studio Admin Alpha',
          role: 'admin',
          organizationName: 'Alpha Media & Podcast Network',
          passwordHash: adminHash,
          createdAt: new Date().toISOString(),
        };
        users.push(admin1);
      } else {
        admin1.role = 'admin';
        admin1.organizationName = admin1.organizationName || 'Alpha Media Network';
        admin1.passwordHash = adminHash;
      }

      // 3. Seed Admin 2 (Beta Media Group)
      let admin2 = users.find((u) => u.email.toLowerCase() === 'admin2@studio.local');
      if (!admin2) {
        admin2 = {
          id: 'usr_admin2',
          email: 'admin2@studio.local',
          name: 'Studio Admin Beta',
          role: 'admin',
          organizationName: 'Beta Broadcast Group',
          passwordHash: adminHash,
          createdAt: new Date().toISOString(),
        };
        users.push(admin2);
      } else {
        admin2.role = 'admin';
        admin2.organizationName = admin2.organizationName || 'Beta Broadcast Group';
        admin2.passwordHash = adminHash;
      }

      // 4. Seed Default Host under Admin 1
      let host1 = users.find((u) => u.email.toLowerCase() === 'host@studio.local' || u.email.toLowerCase() === 'sarah@alpha.local');
      if (!host1) {
        host1 = {
          id: 'usr_host1',
          email: 'host@studio.local',
          name: 'Sarah Connor (Host - Alpha)',
          role: 'host',
          adminId: admin1.id,
          passwordHash: hostHash,
          createdAt: new Date().toISOString(),
        };
        users.push(host1);
      } else {
        host1.adminId = host1.adminId || admin1.id;
        host1.passwordHash = hostHash;
      }

      // 5. Seed Host 2 under Admin 1 (John)
      let hostJohn = users.find((u) => u.email.toLowerCase() === 'john@alpha.local');
      if (!hostJohn) {
        hostJohn = {
          id: 'usr_host_john',
          email: 'john@alpha.local',
          name: 'John Connor (Host - Alpha)',
          role: 'host',
          adminId: admin1.id,
          passwordHash: hostHash,
          createdAt: new Date().toISOString(),
        };
        users.push(hostJohn);
      }

      // 6. Seed Host under Admin 2 (Jane)
      let hostJane = users.find((u) => u.email.toLowerCase() === 'jane@beta.local');
      if (!hostJane) {
        hostJane = {
          id: 'usr_host_jane',
          email: 'jane@beta.local',
          name: 'Jane Foster (Host - Beta)',
          role: 'host',
          adminId: admin2.id,
          passwordHash: hostHash,
          createdAt: new Date().toISOString(),
        };
        users.push(hostJane);
      }

      // 7. Seed Host under Admin 2 (Mike)
      let hostMike = users.find((u) => u.email.toLowerCase() === 'mike@beta.local');
      if (!hostMike) {
        hostMike = {
          id: 'usr_host_mike',
          email: 'mike@beta.local',
          name: 'Mike Ross (Host - Beta)',
          role: 'host',
          adminId: admin2.id,
          passwordHash: hostHash,
          createdAt: new Date().toISOString(),
        };
        users.push(hostMike);
      }

      // 8. Seed Host under Admin 2 (Alice)
      let hostAlice = users.find((u) => u.email.toLowerCase() === 'alice@beta.local');
      if (!hostAlice) {
        hostAlice = {
          id: 'usr_host_alice',
          email: 'alice@beta.local',
          name: 'Alice Cooper (Host - Beta)',
          role: 'host',
          adminId: admin2.id,
          passwordHash: hostHash,
          createdAt: new Date().toISOString(),
        };
        users.push(hostAlice);
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
      if (cleanEmail === 'superadmin@studio.local' && cleanPassword === 'superadmin123') {
        user = {
          id: 'usr_superadmin',
          email: 'superadmin@studio.local',
          name: 'Chief Executive Superadmin',
          role: 'superadmin',
          passwordHash: hash,
          createdAt: new Date().toISOString(),
        };
        users.unshift(user);
      } else if ((cleanEmail === 'admin@studio.local' || cleanEmail === 'admin1@studio.local') && cleanPassword === 'admin123') {
        user = {
          id: 'usr_admin1',
          email: cleanEmail,
          name: 'Studio Admin Alpha',
          role: 'admin',
          organizationName: 'Alpha Media & Podcast Network',
          passwordHash: hash,
          createdAt: new Date().toISOString(),
        };
        users.push(user);
      } else if (cleanEmail === 'admin2@studio.local' && cleanPassword === 'admin123') {
        user = {
          id: 'usr_admin2',
          email: 'admin2@studio.local',
          name: 'Studio Admin Beta',
          role: 'admin',
          organizationName: 'Beta Broadcast Group',
          passwordHash: hash,
          createdAt: new Date().toISOString(),
        };
        users.push(user);
      } else if (cleanEmail === 'host@studio.local' && cleanPassword === 'host123') {
        user = {
          id: 'usr_host1',
          email: 'host@studio.local',
          name: 'Sarah Connor (Host)',
          role: 'host',
          adminId: 'usr_admin1',
          passwordHash: hash,
          createdAt: new Date().toISOString(),
        };
        users.push(user);
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

  // Super Admin can create new Admins
  const createAdminAccount = useCallback(async (
    email: string,
    name: string,
    password: string,
    organizationName: string = 'Independent Studio'
  ): Promise<boolean> => {
    const users = getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return false; // Duplicate
    }
    const hash = await hashPassword(password);
    const newAdmin: User = {
      id: 'usr_admin_' + generateId(),
      email,
      name,
      role: 'admin',
      organizationName,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };
    users.push(newAdmin);
    setStoredUsers(users);
    return true;
  }, []);

  // Admin or Super Admin can create Hosts
  const createHostAccount = useCallback(async (
    email: string,
    name: string,
    password: string,
    targetAdminId?: string
  ): Promise<boolean> => {
    const users = getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return false; // Duplicate
    }

    // Determine the managing admin
    let boundAdminId = targetAdminId;
    if (!boundAdminId && currentUser?.role === 'admin') {
      boundAdminId = currentUser.id;
    } else if (!boundAdminId) {
      const defaultAdmin = users.find((u) => u.role === 'admin');
      boundAdminId = defaultAdmin?.id || 'usr_admin1';
    }

    const hash = await hashPassword(password);
    const newHost: User = {
      id: 'usr_host_' + generateId(),
      email,
      name,
      role: 'host',
      adminId: boundAdminId,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };
    users.push(newHost);
    setStoredUsers(users);
    return true;
  }, [currentUser]);

  const deleteUser = useCallback((id: string) => {
    const users = getStoredUsers().filter((u) => u.id !== id);
    setStoredUsers(users);
  }, []);

  const getAllUsers = useCallback((): User[] => {
    return getStoredUsers();
  }, []);

  const getAllAdmins = useCallback((): User[] => {
    return getStoredUsers().filter((u) => u.role === 'admin');
  }, []);

  const getHostsForAdmin = useCallback((adminId?: string): User[] => {
    const all = getStoredUsers();
    const effectiveAdminId = adminId || (currentUser?.role === 'admin' ? currentUser.id : undefined);
    if (!effectiveAdminId) {
      return all.filter((u) => u.role === 'host');
    }
    return all.filter((u) => u.role === 'host' && (u.adminId === effectiveAdminId || (!u.adminId && effectiveAdminId === 'usr_admin1')));
  }, [currentUser]);

  const createInviteToken = useCallback((email: string, adminId?: string): InviteToken => {
    const invites = getStoredInvites();
    const token: InviteToken = {
      token: generateId() + generateId(),
      email,
      adminId: adminId || currentUser?.id,
      createdAt: new Date().toISOString(),
      used: false,
    };
    invites.push(token);
    setStoredInvites(invites);
    return token;
  }, [currentUser]);

  const getInviteToken = useCallback((token: string): InviteToken | null => {
    const invites = getStoredInvites();
    return invites.find((i) => i.token === token && !i.used) || null;
  }, []);

  const registerWithInvite = useCallback(async (token: string, name: string, password: string): Promise<boolean> => {
    const invite = getInviteToken(token);
    if (!invite) return false;
    const ok = await createHostAccount(invite.email, name, password, invite.adminId);
    if (ok) {
      const invites = getStoredInvites();
      const inv = invites.find((i) => i.token === token);
      if (inv) inv.used = true;
      setStoredInvites(invites);
    }
    return ok;
  }, [getInviteToken, createHostAccount]);

  const updateUser = useCallback(async (
    id: string,
    updates: { name?: string; password?: string; organizationName?: string; adminId?: string }
  ): Promise<boolean> => {
    const users = getStoredUsers();
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) return false;

    if (updates.name && updates.name.trim()) {
      users[userIndex].name = updates.name.trim();
    }
    if (updates.password && updates.password.trim()) {
      users[userIndex].passwordHash = await hashPassword(updates.password.trim());
    }
    if (updates.organizationName !== undefined) {
      users[userIndex].organizationName = updates.organizationName.trim();
    }
    if (updates.adminId !== undefined) {
      users[userIndex].adminId = updates.adminId;
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
        isSuperAdmin: currentUser?.role === 'superadmin',
        isAdmin: currentUser?.role === 'admin',
        isHost: currentUser?.role === 'host' || currentUser?.role === 'admin' || currentUser?.role === 'superadmin',
        isAuthenticated: currentUser !== null,
        login,
        logout,
        createAdminAccount,
        createHostAccount,
        deleteUser,
        getAllUsers,
        getAllAdmins,
        getHostsForAdmin,
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

