import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { UserPublic } from "@collabnotes/shared";
import { authApi } from "../lib/authApi.js";
import { clearSession, loadSession, saveSession } from "../lib/authStorage.js";

type AuthContextValue = {
  user: UserPublic | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogleCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(() => loadSession()?.user ?? null);

  const applyAuthResponse = useCallback(
    (res: { user: UserPublic; accessToken: string; refreshToken: string }) => {
      saveSession(res);
      setUser(res.user);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      applyAuthResponse(await authApi.login({ email, password }));
    },
    [applyAuthResponse],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      applyAuthResponse(await authApi.register({ email, password, displayName }));
    },
    [applyAuthResponse],
  );

  const loginWithGoogleCode = useCallback(
    async (code: string) => {
      applyAuthResponse(await authApi.oauthGoogle(code));
    },
    [applyAuthResponse],
  );

  const logout = useCallback(async () => {
    const session = loadSession();
    if (session) {
      try {
        await authApi.logout(session.refreshToken);
      } catch {
        // Best-effort — clear local state regardless of server outcome.
      }
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, register, loginWithGoogleCode, logout }),
    [user, login, register, loginWithGoogleCode, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
