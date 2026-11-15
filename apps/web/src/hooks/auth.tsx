import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, token } from '../lib/api';

export type User = {
  user_id: string;
  email: string;
  role: string;
  role_id?: string | null;
  role_name?: string;
  display_name: string;
  avatar_url?: string | null;
  shop_id: string;
  permissions?: string[];
};

type CtxValue = {
  user: User | null;
  loading: boolean;
  login: (e: string, p: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<CtxValue>({
  user: null, loading: true, login: async () => {}, logout: () => {}, can: () => false, refreshUser: async () => {},
});

export const useAuth = () => useContext(Ctx);

/** UI convenience only — the API enforces the same permission on every request. */
export function can(user: User | null, permission: string) {
  if (!user) return false;
  const perms = user.permissions || [];
  return perms.includes('*') || perms.includes(permission);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.user);
    } catch {
      setToken('');
      setUser(null);
    }
  };

  useEffect(() => {
    if (!token()) { setLoading(false); return; }
    fetchMe().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    setToken(r.token);
    setUser(r.user);
  };

  const logout = () => {
    setToken(''); setUser(null);
    try {
      Object.keys(sessionStorage).filter((k) => k.startsWith('campaign_reminder_closed:')).forEach((k) => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
  };

  const canFn = (permission: string) => can(user, permission);

  return <Ctx.Provider value={{ user, loading, login, logout, can: canFn, refreshUser: fetchMe }}>{children}</Ctx.Provider>;
}
