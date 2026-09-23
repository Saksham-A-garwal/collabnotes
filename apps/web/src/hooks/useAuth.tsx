import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { RequestCodeResponse, UserPublic } from "@collabnotes/shared";
import { authApi } from "../lib/authApi.js";
import { clearSession, loadSession, saveSession, saveUser } from "../lib/authStorage.js";

type AuthContextValue = {
  user: UserPublic | null;
  isAuthenticated: boolean;
  requestCode: (email: string) => Promise<RequestCodeResponse>;
  verifyCode: (email: string, code: string) => Promise<{ isNewUser: boolean }>;
  updateDisplayName: (displayName: string) => Promise<void>;
  setEmailMentions: (emailMentions: boolean) => Promise<void>;
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

  const requestCode = useCallback((email: string) => authApi.requestCode(email), []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const res = await authApi.verifyCode(email, code);
      applyAuthResponse(res);
      return { isNewUser: res.isNewUser };
    },
    [applyAuthResponse],
  );

  const updateDisplayName = useCallback(async (displayName: string) => {
    const { user: updated } = await authApi.updateProfile(displayName);
    saveUser(updated);
    setUser(updated);
  }, []);

  const setEmailMentions = useCallback(async (emailMentions: boolean) => {
    const { user: updated } = await authApi.updateEmailMentions(emailMentions);
    saveUser(updated);
    setUser(updated);
  }, []);

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
      }
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      requestCode,
      verifyCode,
      updateDisplayName,
      setEmailMentions,
      loginWithGoogleCode,
      logout,
    }),
    [user, requestCode, verifyCode, updateDisplayName, setEmailMentions, loginWithGoogleCode, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
