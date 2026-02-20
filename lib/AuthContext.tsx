import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { apiRequest, getApiUrl } from "./query-client";
import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_KEY = "cardvault_guest_mode";

interface AuthUser {
  id: string;
  email: string;
  isPremium: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isGuest: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  continueAsGuest: () => void;
  setPremiumStatus: (status: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const baseUrl = getApiUrl();
        const url = new URL("/api/auth/me", baseUrl);
        const res = await fetch(url.toString(), { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false });
          setLoading(false);
          return;
        }
      } catch {}
      try {
        const guestFlag = await AsyncStorage.getItem(GUEST_KEY);
        if (guestFlag === "true") {
          setIsGuest(true);
        }
      } catch {}
      setLoading(false);
    };
    checkSession();
  }, []);

  const setPremiumStatus = useCallback((status: boolean) => {
    setUser(prev => prev ? { ...prev, isPremium: status } : prev);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false });
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { email, password });
    const data = await res.json();
    setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false });
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    setUser(null);
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const deleteAccount = useCallback(async () => {
    await apiRequest("POST", "/api/auth/delete-account");
    setUser(null);
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    AsyncStorage.setItem(GUEST_KEY, "true");
  }, []);

  const value = useMemo(
    () => ({ user, isGuest, loading, login, register, logout, deleteAccount, continueAsGuest, setPremiumStatus }),
    [user, isGuest, loading, login, register, logout, deleteAccount, continueAsGuest, setPremiumStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
