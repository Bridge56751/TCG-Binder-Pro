import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { apiRequest, getApiUrl } from "./query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_KEY = "cardvault_guest_mode";

interface AuthUser {
  id: string;
  email: string;
  isPremium: boolean;
  isVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isGuest: boolean;
  loading: boolean;
  needsVerification: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  appleSignIn: (identityToken: string, fullName?: { givenName?: string; familyName?: string } | null, email?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  continueAsGuest: () => void;
  setPremiumStatus: (status: boolean) => void;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  clearVerification: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const baseUrl = getApiUrl();
        const url = new URL("/api/auth/me", baseUrl);
        const res = await globalThis.fetch(url.toString(), { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false, isVerified: data.isVerified ?? false });
          if (!data.isVerified) {
            setNeedsVerification(true);
          }
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
    setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false, isVerified: data.isVerified ?? false });
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
    if (!data.isVerified) {
      setNeedsVerification(true);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { email, password });
    const data = await res.json();
    setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false, isVerified: false });
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
    setNeedsVerification(true);
  }, []);

  const appleSignIn = useCallback(async (
    identityToken: string,
    fullName?: { givenName?: string; familyName?: string } | null,
    email?: string | null
  ) => {
    const res = await apiRequest("POST", "/api/auth/apple", {
      identityToken,
      fullName: fullName || undefined,
      email: email || undefined,
    });
    const data = await res.json();
    setUser({ id: data.id, email: data.email, isPremium: data.isPremium ?? false, isVerified: true });
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const verifyEmail = useCallback(async (code: string) => {
    await apiRequest("POST", "/api/auth/verify-email", { code });
    setUser(prev => prev ? { ...prev, isVerified: true } : prev);
    setNeedsVerification(false);
  }, []);

  const resendVerification = useCallback(async () => {
    await apiRequest("POST", "/api/auth/resend-verification");
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await apiRequest("POST", "/api/auth/request-reset", { email });
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    await apiRequest("POST", "/api/auth/reset-password", { email, code, newPassword });
  }, []);

  const clearVerification = useCallback(() => {
    setNeedsVerification(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    setUser(null);
    setIsGuest(false);
    setNeedsVerification(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const deleteAccount = useCallback(async () => {
    await apiRequest("POST", "/api/auth/delete-account");
    setUser(null);
    setIsGuest(false);
    setNeedsVerification(false);
    await AsyncStorage.removeItem(GUEST_KEY);
    await AsyncStorage.removeItem("cardvault_collection");
  }, []);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    AsyncStorage.setItem(GUEST_KEY, "true");
  }, []);

  const value = useMemo(
    () => ({ user, isGuest, loading, needsVerification, login, register, appleSignIn, logout, deleteAccount, continueAsGuest, setPremiumStatus, verifyEmail, resendVerification, requestPasswordReset, resetPassword, clearVerification }),
    [user, isGuest, loading, needsVerification, login, register, appleSignIn, logout, deleteAccount, continueAsGuest, setPremiumStatus, verifyEmail, resendVerification, requestPasswordReset, resetPassword, clearVerification]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
