'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { CurrentUser } from '@/lib/api/types';
import { getCachedUser, getClientToken, setClientSession, clearClientSession } from '@/lib/auth/session';
import { api, ApiError } from '@/lib/api/client';

interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (token: string, user: CurrentUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initial synchronous hydration from localStorage
  useEffect(() => {
    const cached = getCachedUser();
    const token = getClientToken();

    if (cached && token) {
      setUser(cached);
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }

    // Verify every persisted session against the API before granting access.
    if (token) {
      api.getMe()
        .then((res) => {
          if (res.user) {
            setUser(res.user);
            setClientSession(token, res.user);
          }
        })
        .catch((err) => {
          // Only clear session if explicitly rejected with 401/403
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            clearClientSession();
            setUser(null);
          }
        });
    }
  }, []);

  const refreshUser = async () => {
    const token = getClientToken();
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const res = await api.getMe();
      if (res.user) {
        setUser(res.user);
        setClientSession(token, res.user);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearClientSession();
        setUser(null);
      }
    }
  };

  const login = (token: string, newUser: CurrentUser) => {
    setClientSession(token, newUser);
    setUser(newUser);
    setIsLoading(false);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Always clear the local representation; server expiry still protects the token.
    }
    clearClientSession();
    setUser(null);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
