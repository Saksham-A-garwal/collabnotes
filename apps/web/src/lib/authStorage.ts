import type { UserPublic } from "@collabnotes/shared";

// SRS §5.1 has no `/auth/me` endpoint — login/register return the user
// object, but a bare refresh doesn't. So the user object is cached
// alongside the tokens to survive a page reload without an extra round
// trip; a refresh failure (expired/reused) clears all three together.
const ACCESS_TOKEN_KEY = "collabnotes.accessToken";
const REFRESH_TOKEN_KEY = "collabnotes.refreshToken";
const USER_KEY = "collabnotes.user";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore — private browsing / blocked storage. Session just won't persist.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
};

export function loadSession(): StoredSession | null {
  const accessToken = safeGet(ACCESS_TOKEN_KEY);
  const refreshToken = safeGet(REFRESH_TOKEN_KEY);
  const userRaw = safeGet(USER_KEY);
  if (!accessToken || !refreshToken || !userRaw) return null;

  try {
    return { accessToken, refreshToken, user: JSON.parse(userRaw) as UserPublic };
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  safeSet(ACCESS_TOKEN_KEY, session.accessToken);
  safeSet(REFRESH_TOKEN_KEY, session.refreshToken);
  safeSet(USER_KEY, JSON.stringify(session.user));
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  safeSet(ACCESS_TOKEN_KEY, accessToken);
  safeSet(REFRESH_TOKEN_KEY, refreshToken);
}

export function saveUser(user: UserPublic): void {
  safeSet(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  safeRemove(ACCESS_TOKEN_KEY);
  safeRemove(REFRESH_TOKEN_KEY);
  safeRemove(USER_KEY);
}
